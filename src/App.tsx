// import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import TemplatesPage from './pages/TemplatesPage';
import EditorPage from './pages/EditorPage';
import AutoModePage from './pages/AutoModePage';
// CCAPI camera automation disabled — uncomment when camera integration is needed
// import { startCameraAutomation, stopCameraAutomation } from './services/CameraService';
import AutoUpdater from './components/AutoUpdater';
import './index.css';

function App() {
  // CCAPI camera automation disabled — uncomment when camera integration is needed
  // useEffect(() => {
  //   // Start the ingestion pipeline automatically
  //   startCameraAutomation();
  //
  //   // Clean up if the app is completely destroyed
  //   return () => {
  //     stopCameraAutomation();
  //   };
  // }, []);

  return (
    <>
      <AutoUpdater />
      <Router>
        <Routes>
          <Route path="/" element={<TemplatesPage />} />
          <Route path="/editor/:templateId" element={<EditorPage />} />
          <Route path="/auto/:templateId" element={<AutoModePage />} />
        </Routes>
      </Router>

    </>
  );
}

export default App;

