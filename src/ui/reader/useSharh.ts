import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { newId } from '../../lib/id';
import type { Block, Book, Entity, SharhCard } from '../../types';
import { findSharh } from '../../retrieval/sharh';

// "Show me what the commentary says about this ḥadīth."
//
// Retrieval only. No provider is called, nothing is generated, and the card
// this produces has no cost, no usage and no model — which is why it needs none
// of the machinery the translation and explanation hooks carry.
//
// The card is anchored to the ḥadīth entity's own range, so it behaves like
// every other card in the panel: it scopes to the visible range, collapses,
// survives a restart, and is deleted independently.

export function useSharh(bookId: string, blocks: Block[]) {
  const { storage } = useApp();
  const [cards, setCards] = useState<SharhCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void storage.listSharhCards(bookId).then(setCards);
  }, [storage, bookId]);

  const lookup = useCallback(
    async (entity: Entity, work: Book, matn: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const found = await findSharh(storage, work, matn);

        if (!found) {
          // A miss is stated, not rendered as an empty card. Not every ḥadīth
          // in one collection is commented on in another, and an empty card
          // would look like a failure rather than an answer.
          setNotice(
            `No passage in ${work.title} matched this ḥadīth closely enough to be sure ` +
              `it is the same narration. Nothing is shown rather than a passage that ` +
              `might belong to a different one.`,
          );
          return null;
        }

        const card: SharhCard = {
          id: newId('sharh'),
          kind: 'sharh',
          bookId,
          startBlockId: entity.startBlockId,
          startOffset: entity.startOffset,
          endBlockId: entity.endBlockId,
          endOffset: entity.endOffset,
          createdAt: Date.now(),
          collapsed: false,
          sourceBookId: work.id,
          sourceBookTitle: work.title,
          matnText: found.matnBlock.text,
          passages: found.commentary.map((block) => block.text),
          shingleHits: found.shingleHits,
          shinglesTried: found.shinglesTried,
          truncated: found.truncated,
        };

        await storage.putSharhCard(card);
        setCards((previous) => [...previous, card]);
        return card;
      } finally {
        setBusy(false);
      }
    },
    [storage, bookId],
  );

  const setCollapsed = useCallback(
    async (card: SharhCard, collapsed: boolean) => {
      const next = { ...card, collapsed };
      setCards((previous) =>
        previous.map((existing) => (existing.id === card.id ? next : existing)),
      );
      await storage.putSharhCard(next);
    },
    [storage],
  );

  const remove = useCallback(
    async (card: SharhCard) => {
      await storage.deleteSharhCard(card.id);
      setCards((previous) => previous.filter((existing) => existing.id !== card.id));
    },
    [storage],
  );

  // `blocks` is unused today: the card stores its passages as text so it keeps
  // reading after the commentary is deleted from the library. Kept in the
  // signature because every other card hook takes it and a caller should not
  // have to remember which one is the exception.
  void blocks;

  return { cards, busy, notice, setNotice, lookup, setCollapsed, remove };
}
