import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { ComparePage } from './pages/ComparePage'
import { DataPage } from './pages/DataPage'
import { LabPage } from './pages/LabPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OverviewPage } from './pages/OverviewPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { PresentButton } from './presentation/PresentButton'
import { PresentationProvider } from './presentation/PresentationProvider'
import { PresenterPage } from './presentation/PresenterPage'
import { StoreProvider } from './state/store'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell actions={<PresentButton />} />}>
        <Route index element={<OverviewPage presentAction={<PresentButton large />} />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="lab" element={<LabPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The presenter view only mirrors and commands the main window. */}
        <Route path="presenter" element={<PresenterPage />} />
        <Route
          path="*"
          element={
            <StoreProvider>
              <PresentationProvider>
                <AppRoutes />
              </PresentationProvider>
            </StoreProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
