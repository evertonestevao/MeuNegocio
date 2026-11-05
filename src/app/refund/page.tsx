import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de Reembolso" };

const sections: LegalSection[] = [
  {
    title: "1. Direito de arrependimento",
    body: "Na primeira contratação de um plano pago, você pode desistir em até 7 dias corridos e receber o valor integral de volta (Código de Defesa do Consumidor, art. 49). Depois do estorno, a assinatura é encerrada e o acesso ao painel fica pausado até assinar de novo, com os dados guardados.",
  },
  {
    title: "2. Cancelamento",
    body: "O proprietário da empresa pode cancelar a assinatura a qualquer momento na página de Assinatura do painel. Não há novas cobranças, e o plano continua até o fim do período já pago, informado nessa página. Depois disso, o acesso ao painel fica pausado até assinar de novo.\nO plano anual é uma compra de 12 meses em até 12x no cartão: não renova sozinho, e as parcelas continuam até o fim, mesmo sem uso. Para desistir, use o canal da seção 6. Assinar de novo nesse intervalo inicia uma nova cobrança.",
  },
  {
    title: "3. O que acontece com seus dados sem assinatura",
    body: "Nada é apagado. Orçamentos, clientes, ordens de serviço, fotos e assinaturas continuam guardados. Sem assinatura (no fim do teste grátis, depois do cancelamento ou do estorno), o painel mostra a tela de assinar no lugar das telas do sistema. Os orçamentos já enviados continuam abrindo para os seus clientes, só para consulta. Ao assinar, tudo volta como estava. Ninguém é removido da empresa por causa disso.",
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
  return <LegalPage title="Política de Reembolso" updatedAt="05/11/2026" sections={sections} />;
}
