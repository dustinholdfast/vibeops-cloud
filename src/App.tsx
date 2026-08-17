import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { StatusCards } from './components/StatusCards';
import { ProjectList } from './components/ProjectList';
import { ProjectDrawer } from './components/ProjectDrawer';

function App() {
  return (
    <div className="flex h-full bg-background text-text overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <Header />
            <StatusCards />
            <ProjectList />
          </div>
        </div>
      </main>

      <ProjectDrawer />
    </div>
  );
}

export default App;
