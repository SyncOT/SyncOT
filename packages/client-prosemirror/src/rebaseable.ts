import { Step, Transform } from 'prosemirror-transform'

export class Rebaseable {
    constructor(
        public readonly step: Step,
        public readonly invertedStep: Step,
        public readonly operationKey: string | undefined,
    ) {}
}

/**
 * Creates rebaseable steps from the specified transform.
 */
export function rebaseableStepsFrom(transform: Transform): Rebaseable[] {
    const rebaseableSteps = []
    for (let i = 0; i < transform.steps.length; i++)
        rebaseableSteps.push(
            new Rebaseable(
                transform.steps[i],
                transform.steps[i].invert(transform.docs[i]),
                undefined,
            ),
        )
    return rebaseableSteps
}

/**
 * Updates `tr` to
 * - undo `steps`
 * - apply `otherSteps`
 * - rebase and apply `steps`
 * @param tr An empty transform.
 * @param steps Steps to rebase.
 * @param otherSteps Other steps to apply.
 * @returns Rebased `steps`.
 */
export function rebaseSteps(
    tr: Transform,
    steps: Rebaseable[],
    otherSteps: Step[],
): Rebaseable[] {
    const rebasedSteps: Rebaseable[] = []

    // Undo `steps`.
    for (let i = steps.length - 1; i >= 0; i--) {
        tr.step(steps[i].invertedStep)
    }

    // Apply `otherSteps`.
    for (const step of otherSteps) {
        tr.step(step)
    }

    // Rebase and apply `steps`.
    let mapFrom = steps.length
    for (const step of steps) {
        const mappedStep = step.step.map(tr.mapping.slice(mapFrom))
        mapFrom--
        if (mappedStep && !tr.maybeStep(mappedStep).failed) {
            // It might be an omission that `setMirror` is not declared in typings.
            // It is definitely there though and also used in the "prosemirror-collab" plugin.
            ;(tr.mapping as any).setMirror(mapFrom, tr.steps.length - 1)
            rebasedSteps.push(
                new Rebaseable(
                    mappedStep,
                    mappedStep.invert(tr.docs[tr.docs.length - 1]),
                    step.operationKey,
                ),
            )
        }
    }
    return rebasedSteps
}
