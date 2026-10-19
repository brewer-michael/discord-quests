# Story writer stress test

Run with `pnpm writer:stress` on 2026-10-19. **Passed.**

## Setup

- 20 campaigns on a fresh test database, one hero each, played turn by turn 4 turns with no writer running, then up to 26 more with it running. Two campaigns rewound two turns partway.
- Each campaign asked for its whole story when it was created (outline, bible, spine, chapter 1, side quests, self-check), then chapters, side quests, reworks and recaps as play reached them.
- One more campaign whose daily spending limit had run out.
- Two writer workers in one process, with a scripted AI that takes 0.2 to 2 seconds for each writer call (turns use the quick scripted AI).
- Leases of 4 s renewed every second, so a takeover comes quickly (the service uses 2-minute leases renewed every 30 seconds).
- At 15.1 s and 45.0 s a worker was killed in the middle of a job (w1, bible; w2, bible): from then on its AI calls and queue writes never returned, like a process that died. Each was replaced by a new worker.
- Everything below comes from the pino log lines (1070 of them), checked against the queue and what was published.

## Results

| | |
|---|---|
| Jobs | 90: 88 done, 2 set aside by rewinds, 0 failed, 0 left open |
| By kind | 20 bible, 35 chapter, 35 recap |
| Log: claimed, done, failed, stale, lost | 91, 88, 1, 0, 0 |
| Taken over after a kill and finished from the last saved step | 2 of 2: bible resumed after outline, bible, spine, chapter, side_quests, self_check; bible resumed after outline, bible, spine, chapter, side_quests |
| Published | 54 story versions (one per finished writing job in every campaign: yes), 34 recaps |
| Steps saved twice | 0 |
| Material sent back by the checks | 0 |
| AI steps asked again | 0 (the steps under way when a worker was killed; nothing saved was asked again) |
| Two jobs running for one campaign | never |
| Spending limit | stopped the out-of-budget campaign's job 1 time; it waits for tomorrow without using a try, and the DM room was told: "⚠️ The story writer couldn't write the story: today's spending limit was reached. Trying again tomorrow." |
| Busiest moment | 3 jobs running, 85 waiting |
| Job time (claimed to done) | median 2.8 s, 95th percentile 8.4 s |
| Wait in the queue | median 95.1 s, 95th percentile 131.9 s |
| Whole run | 152.0 s |

## Turns while the writer works (from `turn resolved`)

| | Turns | Median | 95th percentile |
|---|---|---|---|
| No writer running | 80 | 189 ms | 276 ms |
| Writer busy | 520 | 207 ms | 426 ms |

Turns queue the writer's jobs inside their own transaction and never wait for them.

## Log lines

- `turn resolved`: 600
- `writer job claimed`: 91
- `writer job done`: 88
- `writer job failed`: 1
- `writer step done`: 290
