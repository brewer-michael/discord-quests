# Story writer stress test

Run with `pnpm writer:stress` on 2026-10-18. **Passed.**

## Setup

- 20 campaigns on a fresh test database, one hero each, played turn by turn 4 turns with no writer running, then up to 26 more with it running. Two campaigns rewound two turns partway.
- Two writer workers in one process, with a scripted AI that takes 0.2 to 2 seconds for each writer call (turns use the quick scripted AI).
- Leases of 4 s renewed every second, so a takeover comes quickly (the service uses 2-minute leases renewed every 30 seconds).
- At 15.0 s and 45.0 s a worker was killed in the middle of a job (w1, chapter_plan; w2, chapter_plan): from then on its AI calls and queue writes never returned, like a process that died. Each was replaced by a new worker.

## Results

| | |
|---|---|
| Jobs | 95: 94 done, 1 set aside by rewinds, 0 failed, 0 left open |
| By kind | 60 chapter plans, 35 recaps |
| Taken over after a kill and finished | 2 |
| Published | 60 chapter plans (0 chapters twice), 34 recaps |
| Steps saved twice | 0 |
| AI steps asked again | 0 (the steps under way when a worker was killed; nothing saved was asked again) |
| Two jobs running for one campaign | never |
| Busiest moment | 3 jobs running, 87 waiting |
| AI calls by the writer | 156 |
| Job time (claimed to done) | median 1.8 s, 95th percentile 3.7 s |
| Wait in the queue | median 48.9 s, 95th percentile 80.7 s |
| Whole run | 94.4 s |

## Turns while the writer works

| | Turns | Median | 95th percentile |
|---|---|---|---|
| No writer running | 80 | 189 ms | 291 ms |
| Writer busy | 520 | 167 ms | 341 ms |

Turns queue the writer's jobs inside their own transaction and never wait for them.

## Log lines

- `writer job claimed`: 96
- `writer job done`: 94
- `writer step done`: 248
