import ConnectionSwitcher from "./ConnectionSwitcher";
import MobileNavDrawer from "./MobileNavDrawer";

const TopBar = () => {
  return (
    <div className="flex items-center justify-between h-12 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      {/* Left: Mobile Menu + Connection Switcher */}
      <div className="flex items-center gap-4">
        {/* Mobile Nav Drawer */}
        <MobileNavDrawer />

        {/* Connection Switcher */}
        <ConnectionSwitcher />
      </div>
    </div>
  );
};

export default TopBar;
