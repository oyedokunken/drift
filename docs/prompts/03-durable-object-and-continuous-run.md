# 03 Durable Object storage and a continuous run

## Intent

Approve a change to the brief (a Durable Object instead of Workers KV) and let the
agent build the rest without stopping between stages.

## Prompt

> Go. The plan is sent. Approved: Durable Object storage instead of KV, as
> documented. From now on do not stop between stages. Run Stages 3 to 8
> continuously, push to origin so CI runs, and give me a two line status at the end
> of each stage while you keep going. Only stop for: something only I can do
> (wrangler login, secrets, my real hours spent), a decision that changes the brief,
> or a failure you cannot fix. Measure the Durable Object CPU limit in the first
> Worker spike and adapt the design to what you find.

## What it produced

The workspace, CI, engine, Worker and web app, each pushed with CI checked. KV was
dropped because its free plan allows only 1,000 writes a day and the refresh writes
every minute. A throwaway Worker deployed to the account measured the CPU behaviour:
a plain handler ran 200 parses of a 4.4 MB payload (about 2 seconds of CPU) and a
Durable Object ran 1000 (about 10 seconds) without being stopped. The design moved
to one cron trigger driving a Durable Object that fetches the line groups in
parallel, while keeping the request handler light so it would still fit in 10 ms.
The spike Worker was deleted afterwards.
