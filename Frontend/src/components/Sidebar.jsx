import userImg from "../assets/user.png";
import chatIcon from "../assets/new-chat.png";
import newChatIcon from "../assets/new-chat.png";
import searchIcon from "../assets/search.png";
import close from "../assets/close.png";
import logoFull from "../assets/ImplevistaLogo.png";
import logoSmall from "../assets/Vlogo.png";
import sidebaropen from "../assets/sidebar.png";
import sidebarclose from "../assets/sidebar-close.png";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

export default function Sidebar({
  // state
  sidebarOpen,
  collapsed,
  activeId,
  conversations,
  editingChatId,
  editingTitle,
  menuOpenId,

  // setters/handlers
  setSidebarOpen,
  setCollapsed,
  setMenuOpenId,
  setEditingChatId,
  setEditingTitle,
  saveRename,
  cancelRename,
  onNewChat,
  setActiveId,
  handleDelete,

  // ✅ user profile name (from login)
  userName, // <-- pass this from Chat.jsx (from localStorage or state)

  // ✅ logout callback (optional; if you will move logout to ChatWindow, you can omit this)
  onLogout,
}) {
  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
        />
      )}

      <aside
        className={classNames(
          "z-50 flex flex-col border-r border-gray-200 bg-[#f3f4f6]",
          "fixed inset-y-0 left-0 md:static",
          "transform transition-all duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          collapsed ? "w-20" : "w-72"
        )}
      >
        {/* HEADER */}
        <div className="p-2 flex items-center justify-between border-gray-200">
          <div
            className={`flex w-full ${
              collapsed
                ? "flex-col items-center gap-2"
                : "flex-row items-center justify-between"
            }`}
          >
            {/* LOGO */}
            <img
              src={collapsed ? logoSmall : logoFull}
              alt="logo"
              className={`object-contain transition-all duration-300 ${
                collapsed ? "h-8 w-8" : "h-12 w-auto"
              }`}
            />

            {/* TOGGLE BUTTON */}
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden md:flex p-4 rounded-lg hover:bg-gray-200"
            >
              <img
                src={collapsed ? sidebaropen : sidebarclose}
                className="w-5 h-5"
                alt="toggle"
              />
            </button>
          </div>

          {/* MOBILE CLOSE */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden rounded-xl px-3 py-3 border border-gray-300 hover:bg-gray-200"
          >
            <img src={close} className="w-4 h-4" alt="close" />
          </button>
        </div>

        {/* TITLE */}
        {!collapsed && (
          <div className="px-3 pb-3 mt-3 text-xs font-semibold tracking-wide text-zinc-500">
            Your chats
          </div>
        )}

        {/* CONTENT */}
        <div className="flex-1 overflow-auto px-2 pb-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-3 mt-3">
              <button
                onClick={onNewChat}
                className="p-2 rounded-lg hover:bg-gray-200"
              >
                <img src={newChatIcon} className="w-5 h-5" alt="new chat" />
              </button>

              <button className="p-2 rounded-lg hover:bg-gray-200">
                <img src={searchIcon} className="w-5 h-5" alt="search" />
              </button>
            </div>
          ) : (
            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-3 mb-2 text-zinc-800 hover:bg-gray-200 transition"
            >
              <img src={chatIcon} className="w-5 h-5" alt="new chat" />
              New chat
            </button>
          )}

          {!collapsed &&
            conversations
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((c) => (
                <div
                  key={c.id}
                  className={classNames(
                    "relative group flex items-center justify-between rounded-lg px-3 py-2 mb-1",
                    c.id === activeId
                      ? "bg-blue-100 text-blue-700"
                      : "hover:bg-blue-100 text-zinc-800"
                  )}
                >
                  {editingChatId === c.id ? (
                    <input
                      value={editingTitle}
                      autoFocus
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(c.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setActiveId(c.id)}
                      className="w-full flex-1 text-left text-sm truncate px-2 py-2 rounded transition-colors duration-200 hover:bg-blue-100 hover:text-blue-700"
                    >
                      {c.title}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setMenuOpenId(menuOpenId === c.id ? null : c.id)
                    }
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-300"
                    aria-label="Conversation menu"
                  >
                    ⋮
                  </button>

                  {menuOpenId === c.id && (
                    <div className="absolute right-2 top-10 w-32 bg-white border border-gray-200 rounded-lg shadow-md z-50">
                      <button
                        onClick={() => {
                          setEditingChatId(c.id);
                          setEditingTitle(c.title);
                          setMenuOpenId(null);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-100"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
        </div>

        {/* FOOTER (NO LOGOUT HERE; username only) */}
        <div className="p-3 border-t border-gray-200">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={userImg}
                alt="user"
                className="w-8 h-8 rounded-full object-cover"
              />
              {/* show initial / short name */}
              <div className="text-[10px] font-semibold text-zinc-700 truncate max-w-[60px]">
                {userName || "User"}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={userImg}
                  alt="user"
                  className="w-9 h-9 rounded-full object-cover"
                />

                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-zinc-800 truncate">
                    {userName || "User"}
                  </span>
                  <span className="text-xs text-zinc-500">Chatbot v1.0</span>
                </div>
              </div>

              {/* If you truly want logout only in ChatWindow, keep this removed.
                  If you still want an optional logout in sidebar, uncomment below. */}
              {/* {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-xs text-red-500 hover:underline"
                  type="button"
                >
                  Logout
                </button>
              )} */}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}