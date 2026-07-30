import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { ToastContainer, ConfirmDialogRoot, PromptModalRoot } from "../utils/ui.jsx";
import Modals from "../modals/Modals.jsx";

// Items that live in the "More" drawer
const MORE_ITEMS = [
  { key: "calendar",   icon: "◷", label: "Calendar"   },
  { key: "quotes",     icon: "◨", label: "Quotes"     },
  { key: "invoices",   icon: "◪", label: "Invoices"   },
  { key: "inbox",      icon: "📬", label: "Inbox"      },
  { key: "reports",    icon: "▦", label: "Reports"    },
  { key: "receipts",   icon: "◫", label: "Receipts"   },
  { key: "campaigns",  icon: "📣", label: "Campaigns"  },
  { key: "autopilot",  icon: "⚙", label: "Autopilot"  },
];

const NAV_GROUPS = [
  { label: "Home", items: ["dashboard"] },
  { label: "Operations", items: ["calendar", "clients", "jobs", "quotes", "invoices", "inbox"] },
  { label: "Money", items: ["receipts", "finance", "p&l", "reports"] },
  { label: "Growth", items: ["campaigns", "ai", "autopilot"] },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const {
    G, LOGO, isMobile, loading,
    NAV, LABELS, NAV_ICONS, MOBILE_NAV, MOBILE_LABELS, MOBILE_ICONS,
    tab, setTab, search, setSearch, setExpandedId, navigateFnRef,
    unreadMessages, smsModal, setSmsModal, setModal,
    modal, editItem, setEditItem, manageCreditModal, setManageCreditModal,
    recurringModal, setRecurringModal,
    moreOpen, setMoreOpen,
  } = useAppContext();

  React.useEffect(() => { navigateFnRef.current = navigate; }, [navigate]);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100vw",height:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",color:G.muted,flexDirection:"column",gap:12}}>
      <div style={{width:44,height:44,background:G.green,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:19,color:"#fff"}}>SS</div>
      <div style={{fontSize:14}}>Loading your data...</div>
    </div>
  );

  const handleNav = (n) => {
    if (n === "more") { setMoreOpen(true); return; }
    setMoreOpen(false);
    setTab(n);
    setSearch("");
    setExpandedId(null);
    navigate("/" + (n === "dashboard" ? "" : n));
  };

  const handleMoreNav = (n) => {
    setMoreOpen(false);
    setTab(n);
    setSearch("");
    setExpandedId(null);
    navigate("/" + n);
  };

  // Bottom nav height + safe area
  const BOTTOM_NAV_HEIGHT = 56;

  return (
    <div style={{display:"flex",position:"fixed",inset:0,fontFamily:"'Segoe UI',system-ui,sans-serif",background:G.bg,overflow:"hidden"}}>
      <ToastContainer/>
      <ConfirmDialogRoot/>
      <PromptModalRoot/>
      <Modals />

      {/* ── MOBILE TOPBAR ── */}
      {isMobile && (
        <div style={{background:"#fff",borderBottom:`1px solid ${G.border}`,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"fixed",top:0,left:0,right:0,zIndex:200}}>
          <img src={LOGO} alt="SS Exterior Services" style={{height:40,objectFit:"contain"}}/>
          <span style={{color:G.black,fontWeight:800,fontSize:15}}>{LABELS[tab]}</span>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setSmsModal(true)} style={{background:"#e8f5e9",color:"#2e7d32",border:"none",borderRadius:8,padding:"7px 12px",fontSize:13,fontWeight:600,cursor:"pointer"}}>SMS</button>
            <button onClick={()=>setModal("addJob")} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Job</button>
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && (
        <div style={{width:224,background:"#172015",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #233020"}}>
          <div style={{padding:"13px 16px",borderBottom:"1px solid #284520",display:"flex",alignItems:"center",justifyContent:"center",background:"#244b18"}}>
            <img src={LOGO} alt="SS Exterior Services" style={{maxHeight:52,maxWidth:154,objectFit:"contain"}}/>
          </div>
          <div style={{padding:"10px 10px 6px",overflow:"auto"}}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:800,color:"#789071",textTransform:"uppercase",letterSpacing:0,padding:"6px 8px 5px"}}>{group.label}</div>
                {group.items.map(n=>(
                  <button key={n} onClick={()=>handleNav(n)} style={{width:"100%",background:tab===n?"#6DC135":"transparent",color:tab===n?"#fff":"#d8dfd5",border:"none",borderRadius:8,textAlign:"left",padding:"9px 10px",fontSize:13,fontWeight:tab===n?800:600,cursor:"pointer",display:"flex",alignItems:"center",gap:9,transition:"background 0.15s",marginBottom:2}}>
                    <span style={{fontSize:14,opacity:.9,flexShrink:0,width:18,textAlign:"center"}}>{NAV_ICONS[n]||"·"}</span>
                    <span style={{flex:1}}>{LABELS[n]}</span>
                    {n==="inbox"&&unreadMessages>0&&<span style={{background:"#c62828",color:"#fff",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0}}>{unreadMessages}</span>}
                  </button>
                ))}
              </div>
            ))}
            <div style={{marginTop:6,paddingTop:10,borderTop:"1px solid #263124"}}>
              <a href="/marketing" style={{display:"flex",alignItems:"center",gap:9,color:"#d8dfd5",padding:"9px 10px",fontSize:13,fontWeight:600,textDecoration:"none",borderRadius:8}}>
                <span style={{fontSize:14,opacity:.9,flexShrink:0,width:18,textAlign:"center"}}>◬</span>
                <span>Marketing Hub</span>
              </a>
            </div>
          </div>
          <div style={{marginTop:"auto",padding:"12px 13px",borderTop:"1px solid #222"}}>
            <div style={{fontSize:10,color:"#6f7c69",lineHeight:1.9}}>ABN 93 572 816 955<br/>0447 130 743<br/>Kilmore VIC 3764</div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ──
          paddingTop = topbar height (56px)
          paddingBottom = bottom nav + iOS safe area
          Using env() with fallback for non-iOS browsers
      ── */}
      <div style={{
        flex:1,
        display:"flex",
        flexDirection:"column",
        overflow:"hidden",
        minWidth:0,
        maxWidth:"100%",
        boxSizing:"border-box",
        paddingTop: isMobile ? 56 : 0,
        paddingBottom: isMobile ? `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))` : 0,
      }}>
        {children}
      </div>

      {/* ── MORE DRAWER BACKDROP ── */}
      {isMobile && moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:299}}
        />
      )}

      {/* ── MORE DRAWER ── */}
      {isMobile && (
        <div style={{
          position:"fixed",
          left:0,
          right:0,
          bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          background:"#fff",
          borderRadius:"16px 16px 0 0",
          borderTop:`1px solid ${G.border}`,
          zIndex:300,
          transform: moreOpen ? "translateY(0)" : "translateY(110%)",
          transition:"transform 0.28s cubic-bezier(0.32,0.72,0,1)",
          boxShadow:"0 -4px 24px rgba(0,0,0,0.12)",
          padding:"8px 0 12px",
        }}>
          {/* Drag handle */}
          <div style={{width:36,height:4,background:"#e0e0e0",borderRadius:2,margin:"4px auto 12px"}}/>

          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(4, 1fr)",
            gap:"4px 0",
            padding:"0 8px",
          }}>
            {MORE_ITEMS.map(({key, icon, label}) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => handleMoreNav(key)}
                  style={{
                    background: isActive ? "#f0fce8" : "none",
                    border:"none",
                    borderRadius:12,
                    padding:"10px 4px 8px",
                    display:"flex",
                    flexDirection:"column",
                    alignItems:"center",
                    gap:4,
                    cursor:"pointer",
                    color: isActive ? G.green : G.muted,
                    position:"relative",
                  }}
                >
                  <span style={{fontSize:22}}>{icon}</span>
                  <span style={{fontSize:10,fontWeight: isActive ? 700 : 400,lineHeight:1.2}}>{label}</span>
                  {key === "inbox" && unreadMessages > 0 && (
                    <span style={{position:"absolute",top:6,right:"18%",background:"#c62828",color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>
                      {unreadMessages}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <div style={{
          position:"fixed",
          bottom:0,
          left:0,
          right:0,
          background:"#fff",
          borderTop:`1px solid ${G.border}`,
          display:"flex",
          zIndex:300,
          // Push nav above iPhone home indicator
          paddingBottom:"env(safe-area-inset-bottom, 0px)",
        }}>
          {MOBILE_NAV.map(n => {
            const isMore = n === "more";
            const isActive = isMore ? moreOpen : (tab === n && !moreOpen);
            return (
              <button
                key={n}
                onClick={() => handleNav(n)}
                style={{
                  flex:1,
                  background:"none",
                  border:"none",
                  padding:"8px 0 6px",
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  gap:2,
                  cursor:"pointer",
                  color: isActive ? G.green : G.muted,
                  position:"relative",
                }}
              >
                <span style={{fontSize:18}}>{MOBILE_ICONS[n]}</span>
                <span style={{fontSize:10,fontWeight: isActive ? 700 : 400}}>{MOBILE_LABELS[n]}</span>
                {n === "inbox" && unreadMessages > 0 && (
                  <span style={{position:"absolute",top:4,right:"18%",background:"#c62828",color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>
                    {unreadMessages}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
