import { LinkButton } from '../kit';
import { Section } from './Section';

// Settings → the recommended books. Moved verbatim from SettingsScreen.tsx in
// restructure Phase 5 step 5d2 (docs/refactor/plans/phase5-big-ui-files.md).

/**
 * The suggested library, reachable again after first run.
 *
 * The catalog is a list of Shamela IDs and a line each on why the book is
 * worth having — the app never contains the books, which is what keeps a
 * distributed build clear of redistributing modern copyrighted commentary.
 */
export function CatalogSection() {
  return (
    <Section
      title="Add from catalog"
      description="Recommended works with their Shamela IDs, grouped by what they are for. The list is bundled and refreshes from the project repository when you are online."
    >
      <LinkButton to={{ name: 'catalog' }} variant="primary">
        Open the catalog
      </LinkButton>
    </Section>
  );
}
