-- Bear Stearns: Historical case study seed data

-- Insert the institution
insert into institutions (id, name, ticker, sector, description) values
  ('00000000-0000-0000-0000-000000000001', 'Bear Stearns', 'BSC', 'investment_bank', 'Former major U.S. investment bank that collapsed in March 2008 during the subprime mortgage crisis.');

-- Insert historical news articles
insert into news_articles (institution_id, title, source, published_at, summary, sentiment_score, sentiment_label, relevance_score, analyzed_at) values
  ('00000000-0000-0000-0000-000000000001', 'Bear Stearns caught in sub-prime trap', 'The Guardian', '2007-09-20', 'Bear Stearns Q3 profit slumped 62% as subprime mortgage losses hit the firm hard.', -0.400, 'negative', 0.60, now()),
  ('00000000-0000-0000-0000-000000000001', 'Bear Stearns to cut 310 mortgage jobs', 'Reuters', '2007-10-03', 'Bear Stearns cutting 310 positions in mortgage unit as subprime writedowns mount.', -0.300, 'negative', 0.50, now()),
  ('00000000-0000-0000-0000-000000000001', 'How US investment banks fare in subprime crisis', 'Reuters', '2007-12-20', 'Bear Stearns reports first-ever quarterly loss of $859M in Q4 2007.', -0.600, 'very_negative', 0.75, now()),
  ('00000000-0000-0000-0000-000000000001', 'Cayne is replaced as CEO by Schwartz', 'Reuters', '2008-01-08', 'Board ousts CEO Jimmy Cayne after criticism; Alan Schwartz takes over.', -0.350, 'negative', 0.65, now()),
  ('00000000-0000-0000-0000-000000000001', 'Bear Stearns CEO Says Liquidity Strong', 'Reuters', '2008-03-12', 'CEO Schwartz dismisses rumors of a cash crunch, says Bear has $17B cash on hand.', -0.200, 'negative', 0.80, now()),
  ('00000000-0000-0000-0000-000000000001', 'Bear Stearns shares plummet as it seeks emergency funding', 'The Guardian', '2008-03-14', 'Bear Stearns asks Fed for emergency cash; CEO admits liquidity has significantly deteriorated.', -0.900, 'very_negative', 0.98, now()),
  ('00000000-0000-0000-0000-000000000001', 'Fed makes JPMorgan conduit for Bear loan', 'Reuters', '2008-03-14', 'Federal Reserve authorizes 28-day emergency loan via JPMorgan to prevent Bear Stearns collapse.', -0.850, 'very_negative', 0.95, now()),
  ('00000000-0000-0000-0000-000000000001', 'JPMorgan to buy Bear Stearns for $2 a share', 'Reuters', '2008-03-16', 'JPMorgan acquires Bear Stearns for $2/share with $30B Fed backstop, valuing firm at ~$236M.', -0.950, 'very_negative', 1.00, now()),
  ('00000000-0000-0000-0000-000000000001', 'Sold for just $2 a share…', 'The Guardian', '2008-03-17', 'Bear board approves JPMorgan takeover; without deal Bear would have gone bankrupt.', -0.950, 'very_negative', 1.00, now()),
  ('00000000-0000-0000-0000-000000000001', 'Little Sympathy for Financial Fat Cats', 'ABC News', '2008-03-17', 'First major media use of "collapsed" — "As investment bank Bear Stearns collapsed, and was sold to JPMorgan…"', -0.900, 'very_negative', 0.95, now());

-- Insert historical risk signals
insert into risk_signals (institution_id, category, severity, title, description, signal_value, signal_date, source) values
  ('00000000-0000-0000-0000-000000000001', 'news_sentiment', 'medium', 'Q3 profit slumps 62%', 'Guardian reports Bear Stearns Q3 profit dropped 62% due to subprime exposure.', -62, '2007-09-20', 'The Guardian'),
  ('00000000-0000-0000-0000-000000000001', 'news_sentiment', 'low', '310 mortgage jobs cut', 'Reuters reports Bear cutting 310 mortgage unit positions.', null, '2007-10-03', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'regulatory_signal', 'medium', 'Prosecutors probe hedge funds', 'Federal prosecutors investigating Bear Stearns collapsed internal hedge funds.', null, '2007-10-05', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'stock_drop', 'high', 'First-ever quarterly loss ($859M)', 'Bear reports unprecedented Q4 loss. Stock at ~$91.', -859, '2007-12-20', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'executive_departure', 'high', 'CEO Cayne replaced by Schwartz', 'Board ousts Jimmy Cayne after mounting criticism. Stock at ~$71.', null, '2008-01-08', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'client_withdrawal', 'critical', 'Clients pull funds — $16B liquidity drop', 'Internal liquidity falls sharply as prime brokerage clients begin withdrawing en masse.', -16000, '2008-03-10', 'Reuters chronology'),
  ('00000000-0000-0000-0000-000000000001', 'liquidity_warning', 'high', 'CEO denies liquidity problems on CNBC', 'Schwartz insists liquidity is fine with $17B cash. Markets skeptical.', null, '2008-03-12', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'counterparty_action', 'critical', 'Trading partners shun Bear Stearns', 'Reuters reports counterparties refusing to trade. Banks suspend Treasury trading with Bear.', null, '2008-03-13', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'cds_spike', 'critical', 'CDS spreads explode to record levels', 'Cost of insuring Bear Stearns debt surges, signaling extreme default risk.', null, '2008-03-13', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'liquidity_warning', 'critical', 'Emergency Fed funding requested', 'Bear admits liquidity significantly deteriorated. Fed authorizes emergency JPMorgan loan.', null, '2008-03-14', 'The Guardian'),
  ('00000000-0000-0000-0000-000000000001', 'stock_drop', 'critical', 'Stock crashes 47% in one session', 'BSC falls from ~$57 to ~$30 in single day — largest single-day decline.', -47, '2008-03-14', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'credit_downgrade', 'critical', 'S&P downgrades to BBB-', 'Standard & Poors cuts Bear credit rating to near-junk status.', null, '2008-03-14', 'S&P'),
  ('00000000-0000-0000-0000-000000000001', 'regulatory_signal', 'critical', 'JPMorgan acquires Bear for $2/share', 'JPMorgan buys Bear with $30B Fed backstop. Without deal, Bear would have gone bankrupt.', -2, '2008-03-16', 'Reuters'),
  ('00000000-0000-0000-0000-000000000001', 'news_sentiment', 'critical', 'Media declares "collapse"', 'ABC News first major outlet to use "collapsed" — the end of Bear Stearns as independent firm.', null, '2008-03-17', 'ABC News');

-- Insert a sample historical risk score progression
insert into risk_scores (institution_id, score, score_components, signal_count, computed_at) values
  ('00000000-0000-0000-0000-000000000001', 8.50, '{"news_sentiment": 15, "stock_drop": 0}', 1, '2007-09-20'),
  ('00000000-0000-0000-0000-000000000001', 12.00, '{"news_sentiment": 20, "regulatory_signal": 10}', 3, '2007-10-05'),
  ('00000000-0000-0000-0000-000000000001', 22.50, '{"news_sentiment": 20, "stock_drop": 40, "regulatory_signal": 10}', 4, '2007-12-20'),
  ('00000000-0000-0000-0000-000000000001', 30.00, '{"news_sentiment": 20, "stock_drop": 40, "executive_departure": 30, "regulatory_signal": 10}', 5, '2008-01-08'),
  ('00000000-0000-0000-0000-000000000001', 45.00, '{"client_withdrawal": 80, "liquidity_warning": 40, "news_sentiment": 25, "stock_drop": 40}', 7, '2008-03-10'),
  ('00000000-0000-0000-0000-000000000001', 58.00, '{"client_withdrawal": 80, "liquidity_warning": 60, "counterparty_action": 50, "news_sentiment": 30, "stock_drop": 40}', 9, '2008-03-12'),
  ('00000000-0000-0000-0000-000000000001', 78.00, '{"cds_spike": 100, "counterparty_action": 90, "client_withdrawal": 80, "liquidity_warning": 70, "stock_drop": 50, "news_sentiment": 35}', 11, '2008-03-13'),
  ('00000000-0000-0000-0000-000000000001', 95.50, '{"cds_spike": 100, "liquidity_warning": 100, "counterparty_action": 90, "stock_drop": 100, "credit_downgrade": 100, "client_withdrawal": 80, "regulatory_signal": 80, "news_sentiment": 40}', 14, '2008-03-14'),
  ('00000000-0000-0000-0000-000000000001', 98.00, '{"cds_spike": 100, "liquidity_warning": 100, "counterparty_action": 90, "stock_drop": 100, "credit_downgrade": 100, "regulatory_signal": 100, "client_withdrawal": 80, "news_sentiment": 50}', 14, '2008-03-16');
