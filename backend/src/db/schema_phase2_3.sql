-- =========================================================
-- TurfConnect — Phase 2 (Tournament Management) & Phase 3
-- (Player Search) schema. Run against the existing
-- 'turfconnect' database, after Phase 1 tables already exist.
--
-- Run:  psql -U postgres -d turfconnect -f schema_phase2_3.sql
-- =========================================================

-- ---------- PHASE 2: TOURNAMENT MANAGEMENT ----------

CREATE TABLE IF NOT EXISTS tournaments (
    id            SERIAL PRIMARY KEY,
    turf_id       INTEGER NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
    organizer_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    sport         VARCHAR(50) NOT NULL,
    format        VARCHAR(20) NOT NULL
                  CHECK (format IN ('knockout', 'round_robin', 'league')),
    max_teams     INTEGER NOT NULL CHECK (max_teams >= 2),
    entry_fee     NUMERIC(10, 2) DEFAULT 0 CHECK (entry_fee >= 0),
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    created_at    TIMESTAMP DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS teams (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    captain_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport        VARCHAR(50) NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_players (
    id            SERIAL PRIMARY KEY,
    team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_team  VARCHAR(50),
    joined_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (team_id, player_id) -- a player can't be added to the same team twice
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
    id             SERIAL PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    payment_id     INTEGER REFERENCES payments(id),
    status         VARCHAR(20) NOT NULL DEFAULT 'registered'
                   CHECK (status IN ('registered', 'waitlisted', 'withdrawn')),
    registered_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (tournament_id, team_id) -- a team can't register twice for the same tournament
);

CREATE TABLE IF NOT EXISTS fixtures (
    id             SERIAL PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team1_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL, -- nullable to support byes
    team2_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    slot_id        INTEGER REFERENCES slots(id),
    round_number   INTEGER NOT NULL CHECK (round_number >= 1),
    status         VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'in_progress', 'completed', 'postponed')),
    created_at     TIMESTAMP DEFAULT NOW(),
    CHECK (team1_id IS DISTINCT FROM team2_id) -- a team cannot play itself
);

CREATE TABLE IF NOT EXISTS match_results (
    id           SERIAL PRIMARY KEY,
    fixture_id   INTEGER NOT NULL UNIQUE REFERENCES fixtures(id) ON DELETE CASCADE,
    team1_score  INTEGER NOT NULL DEFAULT 0 CHECK (team1_score >= 0),
    team2_score  INTEGER NOT NULL DEFAULT 0 CHECK (team2_score >= 0),
    winner_id    INTEGER REFERENCES teams(id), -- NULL allowed for a draw
    updated_by   INTEGER REFERENCES users(id),
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- ---------- PHASE 3: PLAYER SEARCH ----------

CREATE TABLE IF NOT EXISTS players (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    sport                 VARCHAR(50) NOT NULL,
    position              VARCHAR(50),
    skill_level           VARCHAR(20) NOT NULL DEFAULT 'beginner'
                          CHECK (skill_level IN ('beginner', 'intermediate', 'pro')),
    location              VARCHAR(150),
    availability_status   BOOLEAN NOT NULL DEFAULT true,
    updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_requests (
    id              SERIAL PRIMARY KEY,
    player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id         INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tournament_id   INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    requested_by    INTEGER NOT NULL REFERENCES users(id), -- who initiated: player or captain
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
    id           SERIAL PRIMARY KEY,
    rater_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rated_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context      VARCHAR(20) NOT NULL CHECK (context IN ('turf', 'player')),
    context_id   INTEGER NOT NULL, -- turf_id or tournament_id depending on context
    score        INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    CHECK (rater_id <> rated_id) -- can't rate yourself
);

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_teams_captain ON teams(captain_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_tournament ON fixtures(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_players_sport_availability ON players(sport, availability_status);
CREATE INDEX IF NOT EXISTS idx_player_requests_status ON player_requests(status);
CREATE INDEX IF NOT EXISTS idx_ratings_rated ON ratings(rated_id);