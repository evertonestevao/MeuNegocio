import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de Reembolso" };

const sections: LegalSection[] = [
  {
    title: "1. Direito de arrependimento",
    body: "Na primeira contratação de um plano pago, você pode desistir em até 7 dias corridos e receber o valor integral de volta (Código de Defesa do Consumidor, art. 49). Depois do estorno, a assinatura é encerrada e a empresa passa para o plano gratuito.",
  },
  {
    title: "2. Cancelamento",
    body: "O proprietário da empresa pode cancelar a assinatura a qualquer momento na página de Assinatura do painel. Não há novas cobranças, e o plano continua até o fim do período já pago, informado nessa página. Depois disso, a empresa passa para o plano gratuito.\nAssinar de novo nesse intervalo inicia uma nova cobrança.",
  },
  {
    title: "3. O que acontece com seus dados no plano gratuito",
    body: "Nada é apagado. Orçamentos, clientes, ordens de serviço, fotos e assinaturas continuam guardados. Valem os limites do plano gratuito: se a empresa estiver acima deles, não consegue criar novos registros nem convidar mais membros até voltar para dentro do limite ou assinar de novo. Link de aprovação, nova ordem de serviço e lançamento de horas ficam indisponíveis. Ninguém é removido da empresa por causa disso.",
  },
  {
    title: "4. Membros extras e troca de plano",
    body: "O valor de membros extras é ajustado quando entram ou saem pessoas e vale para as cobranças ainda não pagas e as seguintes. Reduzir a equipe não gera devolução de valores já pagos. Editar a tabela de preços não muda o valor de quem já assina: seu preço só muda se você trocar de plano.",
  },
  {
    title: "5. Reembolsos após 7 dias",
    body: "Fora do prazo de arrependimento, valores de períodos já iniciados não são reembolsados, salvo falha do serviço ou cobrança indevida.",
  },
  {
    title: "6. Como solicitar",
    body: `Envie um e-mail para ${brand.legal.supportEmail} com o nome da empresa e a data da cobrança. O estorno é feito no mesmo meio de pagamento, seja PIX, boleto ou cartão, no prazo da operadora.`,
  },
];

export default function RefundPage() {
  return <LegalPage title="Política de Reembolso" updatedAt="31/10/2026" sections={sections} />;
}
