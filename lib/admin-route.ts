import { sections } from './platform';

export function isAdminRoute(path: string[]) {
  return path[0] === 'admin' && path.length <= 2 && (!path[1] ||
    ['product-editor', 'learning-editor'].includes(path[1]) || sections.some(section => section.key === path[1]));
}
