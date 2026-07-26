import { DemoWorldProvider } from './world-context';
import { isBelajarLabEnabled, roleFromPath, screenFromPath } from './world';
import { BelajarClosedPage, BelajarHub, RoleShell } from './shell';

function presentFromPath() {
  try {
    return new URLSearchParams(window.location.search).get('present') === '1';
  } catch {
    return false;
  }
}

export default function BelajarApp({ path }: { path: string }) {
  if (!isBelajarLabEnabled()) return <BelajarClosedPage />;

  const presentMode = presentFromPath();
  const role = roleFromPath(path);
  const screen = screenFromPath(path);

  return (
    <DemoWorldProvider>
      {!role ? (
        <BelajarHub presentMode={presentMode} />
      ) : (
        <RoleShell role={role} screen={screen} presentMode={presentMode} />
      )}
    </DemoWorldProvider>
  );
}

export { isBelajarLabEnabled, isBelajarLabPath } from './world';
