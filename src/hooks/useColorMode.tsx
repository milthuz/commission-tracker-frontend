import { useTheme } from '../lib/theme';

// Kept for its callers (opener field app, La Passe toggle); now a thin wrapper over the single
// app-wide theme setting in lib/theme — it used to keep its own key and its own <body> class.
const useColorMode = () => {
  const [theme, setTheme] = useTheme();
  return [theme, (v: string) => setTheme(v === 'dark' ? 'dark' : 'light')] as const;
};

export default useColorMode;
