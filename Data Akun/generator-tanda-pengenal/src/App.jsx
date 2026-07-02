import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Dashboard, ImportData, Users, GenerateCards, Export } from './pages';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<ImportData />} />
        <Route path="/users" element={<Users />} />
        <Route path="/generate" element={<GenerateCards />} />
        <Route path="/export" element={<Export />} />
      </Routes>
    </Router>
  );
}

export default App;
