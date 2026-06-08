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
      
      {/* Temporary Phase 1 Verification UI */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        backgroundColor: '#fff',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        maxWidth: '300px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#333' }}>Phase 1: Ingestion Active</h3>
        <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#666' }}>
          Check terminal, console, or Android Logcat to see background download logs.
        </p>
        <button 
          onClick={stopCameraAutomation}
          style={{
            backgroundColor: '#ff4444',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%',
            fontWeight: 'bold'
          }}
        >
          Stop Polling
        </button>
      </div>
    </>
  );
}

export default App;
