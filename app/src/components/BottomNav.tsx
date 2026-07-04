import { NavLink } from "react-router-dom";
import { HomeIcon, CalendarIcon, UsersIcon, StarIcon } from "./icons";

const TABS = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/tournaments", label: "Tournaments", Icon: CalendarIcon, end: false },
  { to: "/players", label: "Players", Icon: UsersIcon, end: false },
  { to: "/records", label: "Records", Icon: StarIcon, end: false },
];

export function BottomNav() {
  return (
    <nav className="bnav">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `ni${isActive ? " on" : ""}`}>
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
