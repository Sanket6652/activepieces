import {
  DedupeStrategy,
  Polling,
  pollingHelper,
} from '@activepieces/pieces-common';
import {
  createTrigger,
  TriggerStrategy,
  OAuth2PropertyValue,
} from '@activepieces/pieces-framework';
import dayjs from 'dayjs';
import { notionCommon } from '../common';
import { Client } from '@notionhq/client';
import { notionAuth } from '../..';
import { isNil } from '@activepieces/shared';

export const newComment = createTrigger({
  auth: notionAuth,
  name: 'new_comment',
  displayName: 'New Comment',
  description: 'Triggers when a new comment is added on a page.',
  props: {
    page_id: notionCommon.page,
  },
  sampleData: {
    object: 'comment',
    id: '223805e9-774b-80b1-9194-001d0c8f56dd',
    parent: {
      type: 'page_id',
      page_id: '1d5805e9-774b-8071-80c0-ffcea9b13b94',
    },
    discussion_id: 'f1c805e9-774b-824f-8511-83edf6abbdda',
    created_time: '2025-07-01T07:19:00.000Z',
    last_edited_time: '2025-07-01T07:19:00.000Z',
    created_by: {
      object: 'user',
      id: '0f46d5cf-06ee-4350-8051-79ad10c898a6',
    },
    rich_text: [
      {
        type: 'text',
        text: {
          content: 'Good DX',
          link: null,
        },
        annotations: {
          bold: false,
          italic: false,
          strikethrough: false,
          underline: false,
          code: false,
          color: 'default',
        },
        plain_text: 'Good DX',
        href: null,
      },
    ],
    display_name: {
      type: 'integration',
      resolved_name: 'Activepieces',
    },
  },
  type: TriggerStrategy.POLLING,
  async test(ctx) {
    return await pollingHelper.test(polling, {
      auth: ctx.auth,
      store: ctx.store,
      propsValue: ctx.propsValue,
      files: ctx.files,
    });
  },
  async onEnable(ctx) {
    await pollingHelper.onEnable(polling, {
      auth: ctx.auth,
      store: ctx.store,
      propsValue: ctx.propsValue,
    });
  },
  async onDisable(ctx) {
    await pollingHelper.onDisable(polling, {
      auth: ctx.auth,
      store: ctx.store,
      propsValue: ctx.propsValue,
    });
  },
  async run(ctx) {
    return await pollingHelper.poll(polling, {
      auth: ctx.auth,
      store: ctx.store,
      propsValue: ctx.propsValue,
      files: ctx.files,
    });
  },
});

const polling: Polling<OAuth2PropertyValue, { page_id: string | undefined }> = {
  strategy: DedupeStrategy.LAST_ITEM,
  items: async ({ auth, propsValue, lastItemId }) => {
    const lastItem = lastItemId as string;
    let lastCreatedDate: string | null;

    if (lastItem) {
      const lastUpdatedEpochMS = Number(lastItem.split('|')[1]);
      lastCreatedDate = dayjs(lastUpdatedEpochMS).toISOString();
    } else {
      lastCreatedDate = lastItem;
    }

    const items = await getComments(auth, propsValue.page_id!, lastCreatedDate);
    return items.map((item: any) => {
      const comment = item as { created_time: string; id: string };
      return {
        id: comment.id + '|' + dayjs(comment.created_time).valueOf(),
        data: item,
      };
    });
  },
};

const getComments = async (
  authentication: OAuth2PropertyValue,
  page_id: string,
  startDate: string | null
) => {
  if (!page_id) {
    throw new Error('Page ID is required');
  }

  const notion = new Client({
    auth: authentication.access_token,
    notionVersion: '2022-02-22',
  });

  try {
    // Check if page is archived
    const page = await notion.pages.retrieve({
      page_id: page_id,
    });

    if ((page as any).archived) {
      return []; // No comments from archived pages
    }

    const results: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let foundOlderComment = false;

    while (hasMore && !foundOlderComment) {
      const response = await notion.comments.list({
        start_cursor: cursor,
        block_id: page_id,
      });

      // Process comments and stop when finding older ones
      for (const comment of response.results) {
        if (!comment || !comment.created_time) continue;

        const commentDate = dayjs(comment.created_time);

        if (startDate) {
          const startDateTime = dayjs(startDate);

          // Stop when finding older comments
          if (
            commentDate.isSame(startDateTime) ||
            commentDate.isBefore(startDateTime)
          ) {
            foundOlderComment = true;
            break;
          }
        }

        results.push(comment);
      }

      hasMore = response.has_more;
      cursor = response.next_cursor || undefined;
    }

    return results.sort(
      (a: any, b: any) =>
        dayjs(b.created_time).valueOf() - dayjs(a.created_time).valueOf()
    );
  } catch (error: any) {
    if (error.message?.includes('capabilities')) {
      throw new Error('Integration lacks required "read comments" capability.');
    }
    throw error;
  }
};
