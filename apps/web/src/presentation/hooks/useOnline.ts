import { useEffect, useState } from 'react';

function readOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useOnline() {
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
