import { NavLink, Outlet } from "react-router-dom";

// The People page: a heading, the tab links, and whichever tab the address names. Each tab is a
// real address (/people, /people/invites), so they are links rather than an ARIA tablist; a third
// tab is one more child route and one more link.
export function PeoplePage() {
  return (
    <section className="people">
      <h1>People</h1>
      <nav aria-label="People sections" className="tabs">
        <NavLink to="/people" end>People</NavLink>
        <NavLink to="/people/invites">Invites</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
