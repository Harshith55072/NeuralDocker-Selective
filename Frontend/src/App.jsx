import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Welcome from './pages/Welcome';
import License from './pages/License';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ClusterDashboard from './pages/ClusterDashboard';
import ClusterSettings from './pages/ClusterSettings';
import SystemResources from './pages/SystemResources';
import CreateCluster from './pages/CreateCluster';
import JoinCluster from './pages/JoinCluster';
import ModelAPI from './pages/ModelAPI';
import Cookbook from './pages/Cookbook';
import Pipeline from './pages/Pipeline';
import WorkerNode from './pages/WorkerNode';
import FloatingRecorder from './components/FloatingRecorder';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
};

// Scrolls the window to the top on every route change. Without this, React
// Router keeps the previous page's scroll offset, so navigating to a shorter
// page (e.g. Welcome -> License while scrolled down) lands mid/bottom-page
// instead of at the top.
const ScrollToTop = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

// Separated so useLocation can be used inside Router context
const AppContent = () => {
  const location = useLocation();
  const HIDDEN_PATHS = ['/', '/login', '/register', '/license'];
  const showRecorder = !HIDDEN_PATHS.includes(location.pathname);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/license" element={<License />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/cluster" element={<ProtectedRoute><ClusterDashboard /></ProtectedRoute>} />
        <Route path="/worker-node" element={<ProtectedRoute><WorkerNode /></ProtectedRoute>} />
        <Route path="/cluster-settings" element={<ProtectedRoute><ClusterSettings /></ProtectedRoute>} />
        <Route path="/system-resources" element={<ProtectedRoute><SystemResources /></ProtectedRoute>} />
        <Route path="/create-cluster" element={<ProtectedRoute><CreateCluster /></ProtectedRoute>} />
        <Route path="/join-cluster" element={<ProtectedRoute><JoinCluster /></ProtectedRoute>} />
        <Route path="/api-hosting" element={<ProtectedRoute><ModelAPI /></ProtectedRoute>} />
        <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
        <Route path="/cookbook" element={<ProtectedRoute><Cookbook /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showRecorder && <FloatingRecorder />}
    </>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;