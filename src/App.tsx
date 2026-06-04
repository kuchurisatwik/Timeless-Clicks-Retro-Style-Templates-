import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import TemplatesPage from './pages/TemplatesPage';
import EditorPage from './pages/EditorPage';
import './index.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TemplatesPage />} />
        <Route path="/editor/:templateId" element={<EditorPage />} />
      </Routes>
    </Router>
  );
}

export default App;
