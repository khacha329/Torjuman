import { createContext, useContext } from 'react';

// Is this view read-only?
//
// ---------------------------------------------------------------------------
// A context rather than a prop, deliberately
//
// The reader's mutating controls are scattered across six components at three
// levels of nesting — the selection rail, the margin menu, the card panel, the
// card popover, the entity sheet, the dictionary sheet. Threading a flag to all
// of them means every intermediate component has to carry a prop it does not
// use, and the failure mode when one is missed is the worst kind available
// here: a visitor gets a button that spends somebody's money, or writes into
// their own library, and nothing says it should not have been there.
//
// A context cannot be forgotten at an intermediate layer. The components that
// own a mutating control ask for themselves, and everything between them stays
// unchanged.
//
// ---------------------------------------------------------------------------
// Hidden, not disabled
//
// Amendment 18 is specific about this and it is right: a visitor has no context
// for why "Translate" would be greyed out. They did not choose a provider, they
// have no key, and they are not going to get one to read a chapter somebody
// sent them. A disabled control is an invitation to work out what is wrong with
// their setup; an absent one is simply a reader that does not translate.
//
// So every use of this reads as `{!readOnly && <Thing/>}`, never as
// `disabled={readOnly}`.
// ---------------------------------------------------------------------------

export const ReadOnlyContext = createContext(false);

/**
 * False everywhere except inside a shared view.
 *
 * Defaulting to false rather than throwing on a missing provider is the right
 * way round: the reader is normally its own owner's, and only share mode is
 * the exception that has to announce itself.
 */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
