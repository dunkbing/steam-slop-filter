-- vote: 1 = slop, -1 = not slop
CREATE TABLE IF NOT EXISTS votes (
  appid      INTEGER NOT NULL,
  voter      TEXT    NOT NULL,
  vote       INTEGER NOT NULL CHECK (vote IN (1, -1)),
  ip_hash    TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (appid, voter)
);
CREATE INDEX IF NOT EXISTS votes_appid_ip ON votes (appid, ip_hash);

CREATE TABLE IF NOT EXISTS disclosures (
  appid      INTEGER PRIMARY KEY,
  ai         INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  checked_at INTEGER NOT NULL
);
