import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { OverviewPage } from './pages/OverviewPage'
import { ComparePage, DataPage, LabPage, NotFoundPage, WorkspacePage } from './pages/stubs'
import { StoreProvider } from './state/store'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
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
      <StoreProvider>
        <AppRoutes />
      </StoreProvider>
    </BrowserRouter>
  )
}
