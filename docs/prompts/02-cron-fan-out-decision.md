# 02 Cron fan-out decision

## Intent

Settle the architecture after discovery showed the arrivals feed is 4.4 MB and
takes 20 to 37 ms of CPU just to parse, against a documented 10 ms free tier limit.

## Prompt

> Approved: option 1, cron fan-out, free tier. Tube lines only to start. Add the
> Elizabeth line only if it fits the 10 ms CPU budget after measuring on a deployed
> Worker. Put the constraint and the decision in the plan message and in
> docs/ARCHITECTURE.md. Continue with docs/RULES.md and docs/plan-for-client.txt,
> then stop for me to send the plan.

## What it produced

`docs/ARCHITECTURE.md` describing the constraint and the decision, `docs/RULES.md`
drafted from real data, and `docs/plan-for-client.txt` under 200 words. Work stopped
there until the plan had been sent to the client.
