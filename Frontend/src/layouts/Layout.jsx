import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Layers, 
  PlusSquare, 
  UserPlus, 
  Settings, 
  LogOut,
  Bell,
  Search,
  ChevronDown
} from 'lucide-react';

const Layout = ({ children }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Cluster', path: '/cluster', icon: Layers },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('accountName');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-border bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 bg-white rounded-lg grid grid-cols-2 gap-[2px] p-1.5 transition-transform group-hover:scale-105">
                <span className="bg-black rounded-sm" />
                <span className="bg-black rounded-sm opacity-35" />
                <span className="bg-black rounded-sm" />
                <span className="bg-black rounded-sm" />
              </div>
              <div className="hidden sm:block">
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest leading-none">NeuralDocker</div>
                <div className="text-sm font-bold tracking-tight">Selective</div>
              </div>
            </Link>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  disabled={link.disabled}
                  onClick={() => !link.disabled && navigate(link.path)}
                  className={`
                    px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-widest transition-all flex items-center gap-2
                    ${location.pathname === link.path 
                      ? 'bg-white text-black font-bold' 
                      : link.disabled 
                        ? 'text-gray-700 cursor-not-allowed' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'}
                  `}
                >
                  <link.icon className="w-3.5 h-3.5" />
                  {link.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-400 hover:text-white transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-accent rounded-full" />
            </button>
            
            <div className="h-6 w-px bg-border mx-2" />

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-all group"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold leading-none mb-1">John Doe</div>
                  <div className="text-[10px] font-mono text-gray-500">john@neuraldocker.io</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold border border-white/10 group-hover:border-white/20 transition-all">
                  JD
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-2">
                        <button className="w-full text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-3">
                          <Settings className="w-4 h-4" />
                          Profile Settings
                        </button>
                        <button className="w-full text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all flex items-center gap-3">
                          <PlusSquare className="w-4 h-4" />
                          Preferences
                        </button>
                        <div className="h-px bg-border my-2 mx-2" />
                        <button 
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all flex items-center gap-3"
                        >
                          <LogOut className="w-4 h-4" />
                          Log Out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full p-6 sm:p-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
