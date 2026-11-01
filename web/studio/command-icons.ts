import { ribbonIcon } from './ribbon-icons.ts';
import { officeCommandIcons } from './office-icons.ts';

// Small commands use the same local vector vocabulary throughout the ribbon
// and contextual tools. Names and shortcuts remain in accessible tooltips.
export const commandIcons: Record<string, string> = {
  'file:new-doc':'new-doc', 'file:open':'folder-open', 'file:open-recent':'history', 'file:save':'save',
  'file:print':'print', 'file:print-to-pdf':'pdf', 'file:page-setup':'page-setup', 'file:export-html':'code',
  'edit:paste':'clipboard-paste', 'edit:find':'search-check', 'edit:delete-object':'trash-2',
  'format:char-shape':'font', 'format:para-shape':'pilcrow', 'format:style-dialog':'paintbrush',
  'page:setup':'page-setup', 'page:col-settings':'columns-2', 'table:create':'table',
  'insert:image':'image', 'insert:shape':'shape', 'insert:textbox':'textbox', 'insert:symbols':'symbols',
  'insert:footnote':'footnote', 'insert:endnote':'endnote', 'view:toggle-grid':'table',
  'view:office-fonts':'font', 'tool:options':'settings-2', 'jakal:ai-edit':'sparkles',
  'jakal:compare':'compare', 'jakal:workbench':'search-check', 'jakal:encrypted-download':'lock',
  'file:save-as': 'files', 'file:save-as-hwpx': 'file-down', 'file:save-as-hwp': 'file-type', 'jakal:original': 'file-clock',
  'edit:cut': 'scissors', 'edit:copy': 'copy', 'edit:format-copy': 'paintbrush', 'edit:format-paste': 'paintbrush-vertical',
  'edit:select-all': 'square-dashed-mouse-pointer', 'edit:delete': 'eraser', 'edit:find-replace': 'replace', 'edit:find-again': 'search-check', 'edit:goto': 'corner-down-right',
  'edit:document-history': 'history', 'edit:undo': 'undo-2', 'edit:redo': 'redo-2',
  'view:zoom-fit-page': 'scan', 'view:zoom-fit-width': 'move-horizontal', 'view:zoom-100': 'scan-line', 'view:zoom-dialog': 'zoom-in',
  'view:ctrl-mark': 'pilcrow', 'view:para-mark': 'corner-down-left', 'view:border-transparent': 'square-dashed', 'view:toggle-clip': 'crop',
  'view:grid-settings': 'grid-2x2-check', 'view:object-layout': 'panels-top-left', 'view:form-mode': 'text-cursor-input', 'view:toolbox-format': 'panel-top',
  'insert:equation': 'radical', 'insert:field': 'text-cursor-input', 'insert:hyperlink': 'link', 'insert:bookmark': 'bookmark',
  'insert:endnote-shape': 'notebook-pen', 'insert:note-close': 'check', 'insert:caption-toggle': 'captions', 'insert:chart-data-edit': 'chart-column',
  'insert:equation-edit': 'square-function', 'insert:picture-props': 'image',
  'page:header-create': 'panel-top', 'page:footer-create': 'panel-bottom', 'page:insert-field-pagenum': 'file-digit', 'page:insert-field-totalpage': 'files', 'page:insert-field-filename': 'file-type',
  'format:bold': 'bold', 'format:italic': 'italic', 'format:underline': 'underline', 'format:strikethrough': 'strikethrough', 'format:superscript': 'superscript', 'format:subscript': 'subscript',
  'format:font-size-increase': 'a-arrow-up', 'format:font-size-decrease': 'a-arrow-down',
  'format:char-ratio-increase': 'stretch-horizontal', 'format:char-ratio-decrease': 'fold-horizontal', 'format:char-spacing-increase': 'between-horizontal-start', 'format:char-spacing-decrease': 'between-horizontal-end',
  'format:align-left': 'align-left', 'format:align-center': 'align-center', 'format:align-right': 'align-right', 'format:align-justify': 'align-justify', 'format:align-distribute': 'align-horizontal-space-between', 'format:align-split': 'wrap-text',
  'format:line-spacing-increase': 'list-start', 'format:line-spacing-decrease': 'list-end', 'format:para-num-shape': 'list-ordered', 'format:bullet-shape': 'list', 'format:level-increase': 'indent-increase', 'format:level-decrease': 'indent-decrease',
  'page:page-border': 'square-dashed', 'page:section-settings': 'file-cog', 'page:headerfooter-prev': 'chevron-left', 'page:headerfooter-next': 'chevron-right', 'page:headerfooter-close': 'check', 'page:headerfooter-delete': 'trash-2',
  'page:new-page-num': 'list-restart', 'page:hide-current': 'eye-off', 'page:col-1': 'square', 'page:col-2': 'columns-2', 'page:col-3': 'columns-3', 'page:col-left': 'panel-left', 'page:col-right': 'panel-right', 'page:break': 'separator-horizontal', 'page:column-break': 'separator-vertical',
  'table:create-nested': 'table-2', 'table:parent-cell': 'corner-left-up', 'table:cell-props': 'table-properties', 'table:border-each': 'grid-2x2',
  'table:insert-row-above': 'table-rows-split', 'table:insert-row-below': 'rows-3', 'table:insert-col-left': 'table-columns-split', 'table:insert-col-right': 'columns-3',
  'table:insert-row-col': 'grid-2x2-plus', 'table:delete-row-col': 'grid-2x2-x', 'table:select-cells': 'square-dashed-mouse-pointer', 'table:cell-split': 'split', 'table:cell-merge': 'merge',
  'table:cell-height-equal': 'align-vertical-distribute-center', 'table:cell-width-equal': 'align-horizontal-distribute-center',
  'table:block-formula': 'calculator', 'table:block-sum': 'sigma', 'table:block-avg': 'divide', 'table:block-product': 'asterisk', 'table:thousand-sep': 'whole-word', 'table:decimal-add': 'list-plus', 'table:decimal-remove': 'list-minus',
  'table:split': 'table-rows-split', 'table:attach': 'table-cells-merge', 'table:transpose-copy': 'copy-plus', 'table:transpose-paste': 'clipboard-paste', 'table:caption-toggle': 'captions',
  'insert:arrange-front': 'bring-to-front', 'insert:arrange-back': 'send-to-back', 'insert:arrange-forward': 'arrow-up-from-line', 'insert:arrange-backward': 'arrow-down-from-line',
  'insert:rotate-cw': 'rotate-cw', 'insert:rotate-ccw': 'rotate-ccw', 'insert:flip-horz': 'flip-horizontal-2', 'insert:flip-vert': 'flip-vertical-2', 'insert:group-shapes': 'group', 'insert:ungroup-shapes': 'ungroup',
  'insert:picture-inline': 'text-cursor', 'insert:picture-floating': 'wrap-text', 'format:object-properties': 'settings-2',
  'insert:hanja':'languages', 'format:toggle-numbering':'list-ordered', 'format:toggle-bullet':'list',
  'table:inline':'text-cursor', 'table:floating':'wrap-text',
};
const primaryIcons = new Set(['new-doc','folder-open','save','print','pdf','page-setup','font','table','shape','textbox','symbols','footnote','endnote','sparkles','compare','lock']);
export function commandIcon(id: string) {
  const name=commandIcons[id];
  return ribbonIcon(officeCommandIcons[id] ?? (primaryIcons.has(name) ? 'icon-'+name : 'icon-mono-'+(name ?? 'file')),16);
}
