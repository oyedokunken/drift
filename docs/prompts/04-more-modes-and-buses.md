# 04 More modes, and buses on demand

## Intent

After the detection fixes were reviewed, extend Drift past the Tube to the Elizabeth line,
the DLR, the Overground and bus routes, within a fixed number of hours and without
lowering the quality bar. The prompt was long, so it is summarised here.

## Prompt (shortened)

> Preparation: report which scheduled live checks ran and whether any rule fired. Merge the
> earlier pull request if CI is green and no false alarm was recorded, with a normal merge
> commit. Open a draft pull request early and commit small and often.
>
> First, make the zero trains rule safe on a Sunday: a service window per day type with
> conservative values, Europe/London handled properly, tests on the clock change dates.
>
> Then generalise the engine with a mode profile and a reachability test for every
> profile. Discover the Elizabeth line, DLR and Overground from the live API before
> deciding anything: line ids, statuses, vehicle ids, payload size, CPU. DLR must not count
> vehicles. Keep rules off where the data does not support them. Keep the heavy parsing in
> the Durable Object and stagger lines if the CPU does not fit.
>
> Buses are checked on search only: validate the route with Zod, cache each route for
> about 45 seconds, coalesce concurrent requests, keep a last good result with a cap,
> and keep a global request budget so a burst of searches cannot pass TfL's limit. Check
> what bus status data says before choosing rules. Anything infrequent, night or thinly
> sampled resolves to unknown with low confidence.
>
> Cut in this order if time runs short: bunching, suggestions, Overground, the Elizabeth
> line wide gaps rule. Never cut the Sunday safety, the tests, the live checks, the budget
> or honest documentation. Do not deploy.

## What it produced

A Sunday safe service window per day type, a mode profile in the engine, the Elizabeth
line, DLR and six Overground lines with a rule set per mode, an on demand bus check
behind a budget, a mode switch and a bus search in the page, and live checks recorded in
`docs/VERIFICATION.md`. Discovery changed three decisions: the DLR feed has blank vehicle
ids (so trains are counted per platform), Weaver sat at a 15.0 minute median gap on Good
Service (so wide gaps is off for the whole Overground), and the bus status is only ever
Good Service or Special Service (so the bus rules are small and mostly say "not enough
data"). Bunching and route suggestions were cut.
