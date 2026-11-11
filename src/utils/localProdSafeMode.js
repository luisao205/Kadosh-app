const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const PRODUCTION_PROJECT_ID = 'kadosh-49600';

export const isLocalProductionReadOnly = ({
  hostname,
  projectId,
  useEmulators = false,
  allowLocalProdWrites = false,
} = {}) => (
  LOCAL_HOSTNAMES.has(String(hostname || '').toLowerCase())
  && projectId === PRODUCTION_PROJECT_ID
  && !useEmulators
  && allowLocalProdWrites !== true
);

