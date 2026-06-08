import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import TemplatesPage from './pages/TemplatesPage';
import EditorPage from './pages/EditorPage';
import { startCameraAutomation, stopCameraAutomation } from './services/CameraService';
import './index.css';

function App() {
  useEffect(() => {
    // Start the ingestion pipeline automatically
    startCameraAutomation();

    // Clean up if the app is completely destroyed
    return () => {
      stopCameraAutomation();
    };
  }, []);

  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<TemplatesPage />} />
          <Route path="/editor/:templateId" element={<EditorPage />} />
        </Routes>
      </Router>

    </>
  );
}

export default App;
