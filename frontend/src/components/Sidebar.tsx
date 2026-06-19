import { 
  IconDashboard, 
  IconMessageDots, 
  IconCookie, 
  IconAdjustments,
  IconSettings,
  IconChartLine,
  IconSparkles,
  IconX,
  IconChevronLeft,
  IconChevronRight
} from '@tabler/icons-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  onClose: () => void;
  sidebarWidth: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  startResizing: (e: React.MouseEvent) => void;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  isMobileOpen, 
  onClose,
  sidebarWidth,
  isCollapsed,
  onToggleCollapse,
  startResizing
}: SidebarProps) {
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

      <div 
        className={`bg-sidebar border-r border-sidebar-border flex flex-col h-screen fixed left-0 top-0 z-50 transition-transform duration-300 ${
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        }`}
        style={{ 
          width: isMobileOpen ? undefined : `${sidebarWidth}px`
        }}
      >
        <div className={`p-4 border-b border-sidebar-border flex items-center justify-between gap-3 ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-xl shrink-0">
              <IconMessageDots size={22} />
            </div>
            {!isCollapsed && (
              <div className="text-base font-bold tracking-wide text-foreground truncate">
                Latezza Agent
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="md:hidden text-muted-foreground hover:text-foreground p-1"
          >
            <IconX size={20} />
          </button>
        </div>
        
        <ul className="p-4 flex flex-col gap-1.5 flex-grow list-none overflow-y-auto">
          {menuItems.map((item) => (
            <li 
              key={item.id}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
              } ${
                activeTab === item.id 
                  ? 'text-sidebar-accent-foreground bg-sidebar-accent border-l-4 border-primary rounded-l-none' 
                  : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
              onClick={() => {
                setActiveTab(item.id);
                onClose(); // Auto-close sidebar on mobile menu click
              }}
            >
              <div className="shrink-0">{item.icon}</div>
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </li>
          ))}
        </ul>

        {/* Collapse/Expand Toggle Button (Desktop only) */}
        <div className="hidden md:flex p-3 border-t border-sidebar-border/40 justify-center">
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-lg hover:bg-sidebar-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          </button>
        </div>
        
        <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground text-center">
          {!isCollapsed ? (
            <>
              <div>Verifikasi Sukses</div>
              <div className="font-semibold mt-1 text-foreground">
                Latezza Cake Hampers
              </div>
            </>
          ) : (
            <div className="flex justify-center text-primary">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          )}
        </div>

        {/* Resize Handle (Desktop only) */}
        <div 
          onMouseDown={startResizing}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary transition-all z-50 group"
          title="Drag to resize sidebar"
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-border/40 rounded-full group-hover:bg-primary/70 transition-colors" />
        </div>
      </div>
    </>
  );
}
