// Backward-compat shim — components moved to src/components/advanced/
import ECRScreen from "../components/advanced/ECRScreen.jsx";
import RFQCompareModal from "../components/advanced/RFQCompareModal.jsx";
import ComplianceScreen from "../components/advanced/ComplianceScreen.jsx";
import AIAssistant from "../components/advanced/AIAssistant.jsx";
import CalendarScreen from "../components/advanced/CalendarScreen.jsx";
import CostSimulatorModal from "../components/advanced/CostSimulatorModal.jsx";
import OnboardingChecklist from "../components/advanced/OnboardingChecklist.jsx";
import PriceAlertsModal from "../components/advanced/PriceAlertsModal.jsx";
import InflationAnalysisModal from "../components/advanced/InflationAnalysisModal.jsx";
import InternetScrapeModal from "../components/advanced/InternetScrapeModal.jsx";

Object.assign(window, {
  ECRScreen,
  RFQCompareModal,
  ComplianceScreen,
  AIAssistant,
  CalendarScreen,
  CostSimulatorModal,
  OnboardingChecklist,
  PriceAlertsModal,
  InflationAnalysisModal,
  InternetScrapeModal,
});
