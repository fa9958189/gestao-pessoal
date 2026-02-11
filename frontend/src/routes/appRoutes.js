export const ROOT_PATH = '/';

export const VIEW_TO_PATH = {
  transactions: '/dashboard',
  agenda: '/agenda',
  users: '/usuarios',
  affiliates: '/afiliados',
  workout: '/treino',
  foodDiary: '/diario-alimentar',
  generalReport: '/relatorio-geral',
};

const PROTECTED_PATHS = Object.values(VIEW_TO_PATH);

export const getPathForView = (view) => VIEW_TO_PATH[view] || VIEW_TO_PATH.transactions;

export const getViewForPath = (path) => {
  const match = Object.entries(VIEW_TO_PATH).find(([, routePath]) => routePath === path);
  return match?.[0] || null;
};

export const isProtectedPath = (path) => PROTECTED_PATHS.includes(path);

export const isAdminOnlyView = (view) => view === 'users' || view === 'affiliates';

export const normalizeAppPath = (path) => {
  const rawPath = String(path || '').replace(/^#/, '');
  const normalizedPath = rawPath.startsWith('/') ? rawPath : (rawPath ? `/${rawPath}` : ROOT_PATH);
  const noQuery = normalizedPath.split('?')[0];

  // remove trailing slash (exceto "/")
  const cleanPath = (noQuery.length > 1) ? noQuery.replace(/\/+$/, '') : noQuery;

  if (cleanPath === ROOT_PATH || isProtectedPath(cleanPath)) {
    return cleanPath;
  }

  return '*';
};
