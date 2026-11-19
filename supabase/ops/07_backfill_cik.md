> Automated: `SEC_EDGAR_EMAIL=you@example.com node scripts/backfill-cik.mjs --apply` does the steps below
> (dry run without `--apply`). The address is read from the environment and never stored in the repo.

# ops/07: backfill `institutions.cik`

One-off, by hand, service role / SQL editor. Not a migration, not automated.

## Why

`fetch-insider-trades` (Form 4) and `fetch-sec-filings` (10-K/10-Q) look up EDGAR by CIK and skip any
institution whose `cik` is null. Only 11 of the 61 active banks have one (F016, F053), so the
insider-selling and balance-sheet signals have effectively never run for most of the watchlist.

## Source

SEC publishes the ticker-to-CIK map at <https://www.sec.gov/files/company_tickers.json>:

```json
{ "0": { "cik_str": 19617, "ticker": "JPM", "title": "JPMORGAN CHASE & CO" }, ... }
```

EDGAR requires a descriptive `User-Agent` with a contact address (the same value as the
`SEC_EDGAR_EMAIL` secret), and asks for at most 10 requests per second. This is a single download.

## Steps

1. Inspect what is missing (SQL editor):

   ```sql
   select ticker, name
   from institutions
   where is_active and ticker is not null and cik is null
   order by ticker;
   ```

2. Download the map and turn it into one `VALUES` list. From a shell (the `User-Agent` must name you):

   ```sh
   curl -s -A 'Failure Signal research <you@example.com>' \
     https://www.sec.gov/files/company_tickers.json \
   | python3 -I -c '
   import json, sys
   rows = json.load(sys.stdin).values()
   # EDGAR CIKs are zero-padded to 10 digits in every data.sec.gov URL the functions build.
   print(",\n".join(f"(\x27{r[\"ticker\"].upper()}\x27, \x27{int(r[\"cik_str\"]):010d}\x27)" for r in rows))
   ' > /tmp/sec_tickers.sql
   ```

3. Paste the list into this statement and run it. It only touches active rows that have no CIK yet,
   matches on upper-cased ticker, and never overwrites an existing value:

   ```sql
   begin;

   create temp table sec_map (ticker text primary key, cik text) on commit drop;
   insert into sec_map (ticker, cik) values
     -- paste /tmp/sec_tickers.sql here
     ('JPM', '0000019617')
   on conflict do nothing;

   update institutions i
   set cik = m.cik, updated_at = now()
   from sec_map m
   where i.is_active
     and i.cik is null
     and upper(i.ticker) = m.ticker;

   -- verify
   select count(*) filter (where cik is not null) as with_cik,
          count(*) filter (where cik is null)     as still_missing
   from institutions
   where is_active;

   commit;
   ```

4. Review what is still missing. Expected leftovers:

   - **Foreign private issuers** (ADRs such as BCS, DB, TD, UBS, MUFG, SAN, ING, LYG, NWG, HSBC):
     they file 20-F/40-F and 6-K, not 10-K/10-Q or Form 4. Leave `cik` null for them on purpose;
     `fetch-insider-trades` and `fetch-sec-filings` skip null CIKs, which is the correct behaviour
     until the functions accept 20-F/40-F.
   - Tickers that differ from EDGAR's spelling (class suffixes like `BRK.B` vs `BRK-B`, or OTC
     tickers for ADRs). Fix the few by hand with `update institutions set cik = '...' where id = '...'`.

5. The next scheduled `fetch-insider-trades` (10:00 UTC daily) and `fetch-sec-filings` (12:00 UTC
   Mondays) runs pick the new CIKs up automatically. Check `insider_trades` and `sec_filings` for new
   rows the following day.

## Do not

- Do not run this from application code or an edge function on a schedule; the SEC map changes rarely
  and the download is a one-time thing.
- Do not set a CIK for an inactive row or overwrite one that exists; a wrong CIK silently attributes
  another company's filings to the bank.
