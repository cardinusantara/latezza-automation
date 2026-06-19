import { 
  IconDashboard, 
  IconMessageDots, 
  IconCookie, 
  IconAdjustments,
  IconSettings,
  IconChartLine,
  IconSparkles,
  IconX
} from '@tabler/icons-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, isMobileOpen, onClose }: SidebarProps) {
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: <IconDashboard size={18} /> },
    { id: 'inbox', label: 'Chat Inbox', icon: <IconMessageDots size={18} /> },
    { id: 'products', label: 'Product Catalog', icon: <IconCookie size={18} /> },
    { id: 'ads-report', label: 'Ads Report', icon: <IconChartLine size={18} /> },
    { id: 'creative-ideas', label: 'Creative Ideas', icon: <IconSparkles size={18} /> },
    { id: 'actions', label: 'Actions & Controls', icon: <IconAdjustments size={18} /> },
    { id: 'settings', label: 'Settings Panel', icon: <IconSettings size={18} /> }
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <div className={`w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-300 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-6 border-b border-sidebar-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-xl">
              <IconMessageDots size={22} />
            </div>
            <div className="text-base font-bold tracking-wide text-foreground">
              Latezza Agent
            </div>
          </div>
          <button 
            onClick={onClose}
            className="md:hidden text-muted-foreground hover:text-foreground p-1"
          >
            <IconX size={20} />
          </button>
        </div>
        
        <ul className="p-6 flex flex-col gap-2 flex-grow list-none">
          {menuItems.map((item) => (
            <li 
              key={item.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                activeTab === item.id 
                  ? 'text-sidebar-accent-foreground bg-sidebar-accent border-l-4 border-primary rounded-l-none' 
                  : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
              onClick={() => {
                setActiveTab(item.id);
                onClose(); // Auto-close sidebar on mobile menu click
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        
        <div className="p-6 border-t border-sidebar-border text-xs text-muted-foreground text-center">
          <div>Verifikasi Sukses</div>
          <div className="font-semibold mt-1 text-foreground">
            Latezza Cake Hampers
          </div>
        </div>
      </div>
    </>
  );
}
