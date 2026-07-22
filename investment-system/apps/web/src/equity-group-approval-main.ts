import { createApp } from 'vue';
import EquityProjectApplicationPage from './pages/EquityProjectApplicationPage.vue';
import './styles.css';

createApp(EquityProjectApplicationPage, {
  standalone: true,
  variant: 'groupApproval'
}).mount('#app');
