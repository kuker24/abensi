import { App as SchoolHubApp } from './app/SchoolHubApp';

export interface SchoolHubUser {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN_TU' | 'OPERATOR_IT' | 'GURU_MAPEL' | 'GURU_PIKET' | 'SISWA';
}

function App() {
  return <SchoolHubApp />;
}

export { App };
