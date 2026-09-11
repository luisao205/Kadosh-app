import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NavigationGuardContext = createContext({
  registerNavigationGuard: () => () => {},
  confirmNavigation: async () => true
});

export const NavigationGuardProvider = ({ children }) => {
  const [guard, setGuard] = useState(null);

  const registerNavigationGuard = useCallback((guardFn) => {
    setGuard(() => (typeof guardFn === 'function' ? guardFn : null));
    return () => {
      setGuard(current => (current === guardFn ? null : current));
    };
  }, []);

  const confirmNavigation = useCallback(async () => {
    if (!guard) return true;
    return Boolean(await guard());
  }, [guard]);

  const value = useMemo(() => ({
    registerNavigationGuard,
    confirmNavigation
  }), [confirmNavigation, registerNavigationGuard]);

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
};

export const useNavigationGuard = () => useContext(NavigationGuardContext);
