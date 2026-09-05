import { Root } from 'mdast';
import { BuildCtx } from '@quartz-community/types';

/**
 * Configurable plugin entry point.
 */
declare function QuartzObsidianAdmonition(_opts?: Record<string, unknown>): {
    name: string;
    markdownPlugins: (ctx: BuildCtx) => Array<() => (tree: Root) => void>;
    externalResources?: (ctx: BuildCtx) => {
        css: Array<{
            content: string;
        }>;
    };
};

export { QuartzObsidianAdmonition, QuartzObsidianAdmonition as default };
