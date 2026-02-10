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
  if (path === ROOT_PATH || isProtectedPath(path)) {
    return path;
  }

  return '*';
};
