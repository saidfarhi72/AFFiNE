import {
  createReactComponentFromLit,
  useConfirmModal,
  useLitPortalFactory,
} from '@affine/component';
import { useJournalInfoHelper } from '@affine/core/hooks/use-journal';
import { QuickSearchService } from '@affine/core/modules/cmdk';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { BlockSpec } from '@blocksuite/block-std';
import {
  BiDirectionalLinkPanel,
  DocMetaTags,
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import React, {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PagePropertiesTable } from '../../affine/page-properties';
import { AffinePageReference } from '../../affine/reference-link';
import { BlocksuiteEditorJournalDocTitle } from './journal-doc-title';
import {
  patchNotificationService,
  patchPeekViewService,
  patchQuickSearchService,
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from './specs/custom/spec-patchers';
import { EdgelessModeSpecs } from './specs/edgeless';
import { PageModeSpecs } from './specs/page';
import * as styles from './styles.css';

const adapted = {
  DocEditor: createReactComponentFromLit({
    react: React,
    elementClass: PageEditor,
  }),
  DocTitle: createReactComponentFromLit({
    react: React,
    elementClass: DocTitle,
  }),
  PageMetaTags: createReactComponentFromLit({
    react: React,
    elementClass: DocMetaTags,
  }),
  EdgelessEditor: createReactComponentFromLit({
    react: React,
    elementClass: EdgelessEditor,
  }),
  BiDirectionalLinkPanel: createReactComponentFromLit({
    react: React,
    elementClass: BiDirectionalLinkPanel,
  }),
};

interface BlocksuiteEditorProps {
  page: Doc;
}

const usePatchSpecs = (page: Doc, specs: BlockSpec[]) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const peekViewService = useService(PeekViewService);
  const quickSearchService = useService(QuickSearchService);
  const referenceRenderer: ReferenceReactRenderer = useMemo(() => {
    return function customReference(reference) {
      const pageId = reference.delta.attributes?.reference?.pageId;
      if (!pageId) return <span />;
      return (
        <AffinePageReference docCollection={page.collection} pageId={pageId} />
      );
    };
  }, [page.collection]);

  const confirmModal = useConfirmModal();
  const patchedSpecs = useMemo(() => {
    let patched = patchReferenceRenderer(specs, reactToLit, referenceRenderer);
    patched = patchNotificationService(
      patchReferenceRenderer(patched, reactToLit, referenceRenderer),
      confirmModal
    );
    if (!page.readonly && runtimeConfig.enablePeekView) {
      patched = patchPeekViewService(patched, peekViewService);
    }
    if (!page.readonly) {
      patched = patchQuickSearchService(patched, quickSearchService);
    }
    return patched;
  }, [
    confirmModal,
    page.readonly,
    peekViewService,
    quickSearchService,
    reactToLit,
    referenceRenderer,
    specs,
  ]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
};

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteEditorProps
>(function BlocksuiteDocEditor({ page }, ref) {
  const titleRef = useRef<DocTitle>(null);
  const docRef = useRef<PageEditor | null>(null);
  const [docPage, setDocPage] =
    useState<HTMLElementTagNameMap['affine-page-root']>();
  const { isJournal } = useJournalInfoHelper(page.collection, page.id);

  const workbench = useService(WorkbenchService).workbench;
  const activeView = useLiveData(workbench.activeView$);
  const hash = useLiveData(activeView.location$).hash;

  const onDocRef = useCallback(
    (el: PageEditor) => {
      docRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    // auto focus the title
    setTimeout(() => {
      const docPage = docRef.current?.querySelector('affine-page-root');
      if (docPage) {
        setDocPage(docPage);
      }
      if (titleRef.current && !hash) {
        const richText = titleRef.current.querySelector('rich-text');
        richText?.inlineEditor?.focusEnd();
      } else {
        docPage?.focusFirstParagraph();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [specs, portals] = usePatchSpecs(page, PageModeSpecs);

  return (
    <>
      <div className={styles.affineDocViewport} style={{ height: '100%' }}>
        {!isJournal ? (
          <adapted.DocTitle doc={page} ref={titleRef} />
        ) : (
          <BlocksuiteEditorJournalDocTitle page={page} />
        )}
        <PagePropertiesTable page={page} />
        <adapted.DocEditor
          className={styles.docContainer}
          ref={onDocRef}
          doc={page}
          specs={specs}
          hasViewport={false}
        />
        {docPage && !page.readonly ? (
          <div
            className={styles.docEditorGap}
            onClick={() => {
              docPage.std.spec.getService('affine:page').appendParagraph();
            }}
          ></div>
        ) : null}
        {docPage && !page.readonly ? (
          <adapted.BiDirectionalLinkPanel doc={page} pageRoot={docPage} />
        ) : null}
      </div>
      {portals}
    </>
  );
});
export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteEditorProps
>(function BlocksuiteEdgelessEditor({ page }, ref) {
  const [specs, portals] = usePatchSpecs(page, EdgelessModeSpecs);
  const editorRef = useRef<EdgelessEditor | null>(null);

  const onDocRef = useCallback(
    (el: EdgelessEditor) => {
      editorRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateComplete
        .then(() => {
          // make sure editor can get keyboard events on showing up
          editorRef.current?.querySelector('affine-edgeless-root')?.click();
        })
        .catch(console.error);
    }
  }, []);

  return (
    <>
      <adapted.EdgelessEditor ref={onDocRef} doc={page} specs={specs} />
      {portals}
    </>
  );
});
