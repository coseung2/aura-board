# Excise — the taxonomy of forced work

Alan Cooper, *About Face* (ch. 12, "Reducing Work and Eliminating Excise").

## Definition

> **Excise tasks** — work that does not contribute directly to the user's goal, but is
> required to satisfy the needs of our tool or the demands of an outside agent.

Excise is a *tax* the interface levies on the user. The four labours it can force:

| Labour | What it costs the user | Aura Board-shaped example |
|---|---|---|
| **Cognitive** | understanding, deciding | "이 버튼을 지금 눌러야 하나?" |
| **Memory** | recalling where/when | "저번엔 어디서 눌렀더라" |
| **Visual** | scanning to find state | 최신인지 눈으로 훑기 |
| **Physical** | clicks, drags, **and the clicks required to move between steps** | 1버튼 → 2버튼 |

## The deciding test: forced vs discretion

> A behaviour is excise when **forced on** the user; the same behaviour is not excise
> when left to the user's **discretion**.

So the question is never "does this step exist?" but "**did the user have to do it?**"
- Forced + doesn't advance the persona's goal → excise
- Forced, but *is* the persona's goal (send, submit, pay) → goal-directed
- Available but optional (advanced settings, shortcuts) → not excise, even if unused

Excise is **contextual**: one persona's goal-directed work is another's excise. Never
label a step without naming the persona whose goal you are measuring against.

## Root cause: the implementation model leaking into the interface

Cooper's three models:

| Model | What it is |
|---|---|
| **Implementation model** | how the system is actually built (scheduler, queue, worker, table) |
| **Mental model** | what the user believes is happening |
| **Represented model** | what the UI shows |

Excise is what you get when the represented model follows the **implementation** model
instead of the user's **mental model**. The user's mental model has no "scheduler" in
it — only "my change is reflected". So a UI with a "스케줄러 실행" button is a direct
transcription of the backend, and the user is billed for it.

**Corollary for agents:** an agent that reads the code inherits the implementation
model by default, so it will *naturally* reproduce this failure. Avoiding excise is
the deliberate act, not the default.

## The counter-pattern: mid-zone affordance

Auto-everything is not the answer. Where a change is genuinely the user's call, or
where silent churn destroys context, the good pattern is to **push the information,
leave the transition to the user**:

- ✗ manual-only: user must remember to refresh → memory excise
- ✗ silent auto: content shifts under the user, selection/scroll lost → visual excise
- ✓ mid-zone: "새 항목 3개" affordance — the system detects the state and offers the
  transition in one click the user *decides* on

Note what this does to KLM: it does not remove the `M P B`, it removes the **second M**
(the "should I refresh? when?" judgement) by supplying the missing state information.

## Impossible states

Modelling a flow as a state machine rather than a set of buttons surfaces bugs the
button list hides: *실행 중인데 실행 가능*, *완료됐는데 진행 표시*, *오류 후 재시도
불가*. Statecharts are specifically good at exposing **impossible states** and
undesirable transitions. Before proposing a fix, write the states — if the current UI
can represent an impossible state, that is a finding on its own.

## Detecting excise: use the agent as the first user

The cheap test that needs no human recruiters: **give an agent the goal and watch
where it stalls.** Agent expectations about "how software normally works" are broad and
explicit, so when an agent hesitates, clicks around, or finds a workaround, that is
strong evidence the flow is not as self-evident as its author assumed. Record the
stall point; it is a finding.

## Sources

- Cooper et al., *About Face: The Essentials of Interaction Design*, ch. 12
- Krug, *Don't Make Me Think* (clicks vs mindless choices)
- Pencil & Paper, UX pattern writeups on refresh/sync controls
- Statecharts literature on impossible states
