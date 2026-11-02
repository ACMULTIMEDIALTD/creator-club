import { Navigate, Route, Routes } from 'react-router-dom';
import { DEMO } from './demo/flag.js';
import DemoBar from './demo/DemoBar.jsx';
import NativeBridge from './native/NativeBridge.jsx';
import MagicLink from './pages/MagicLink.jsx';
import { RequireAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Brands from './pages/Brands.jsx';
import Terms from './pages/Terms.jsx';
import Install from './pages/Install.jsx';
import Accessibility from './pages/Accessibility.jsx';
import Join from './pages/Join.jsx';
import Login from './pages/Login.jsx';
import Password from './pages/Password.jsx';
import DeleteAccount from './pages/DeleteAccount.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Campaign from './pages/Campaign.jsx';
import EditProfile from './pages/EditProfile.jsx';
import MyApplications from './pages/MyApplications.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import AdminCreators from './pages/admin/AdminCreators.jsx';
import AdminCampaigns from './pages/admin/AdminCampaigns.jsx';
import AdminCampaignForm from './pages/admin/AdminCampaignForm.jsx';
import AdminCampaign from './pages/admin/AdminCampaign.jsx';
import AdminBrands from './pages/admin/AdminBrands.jsx';
import AdminPayments from './pages/admin/AdminPayments.jsx';
import AdminTeam from './pages/admin/AdminTeam.jsx';
import AdminCampaignPreview from './pages/admin/AdminCampaignPreview.jsx';

const creator = (el) => <RequireAuth role="creator">{el}</RequireAuth>;
const admin = (el) => <RequireAuth role="admin">{el}</RequireAuth>;

export default function App() {
  return (
    <>
    {DEMO && <DemoBar />}
    <NativeBridge />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/brands" element={<Brands />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/install" element={<Install />} />
      <Route path="/accessibility" element={<Accessibility />} />
      <Route element={<Layout />}>
        <Route path="/join" element={<Join />} />
        <Route path="/login" element={<Login />} />
        <Route path="/m/:token" element={<MagicLink />} />
        <Route path="/dashboard" element={creator(<Dashboard />)} />
        <Route path="/c/:slug" element={<RequireAuth><Campaign /></RequireAuth>} />
        <Route path="/me" element={creator(<EditProfile />)} />
        <Route path="/password" element={<RequireAuth><Password /></RequireAuth>} />
        <Route path="/me/delete" element={creator(<DeleteAccount />)} />
        <Route path="/me/applications" element={creator(<MyApplications />)} />
        <Route path="/admin" element={admin(<AdminHome />)} />
        <Route path="/admin/creators" element={admin(<AdminCreators />)} />
        <Route path="/admin/campaigns" element={admin(<AdminCampaigns />)} />
        <Route path="/admin/campaigns/new" element={admin(<AdminCampaignForm />)} />
        <Route path="/admin/campaigns/:id/edit" element={admin(<AdminCampaignForm />)} />
        <Route path="/admin/campaigns/:id" element={admin(<AdminCampaign />)} />
        <Route path="/admin/payments" element={admin(<AdminPayments />)} />
        <Route path="/admin/team" element={admin(<AdminTeam />)} />
        <Route path="/admin/preview/:slug" element={admin(<AdminCampaignPreview />)} />
        <Route path="/admin/brands" element={admin(<AdminBrands />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
