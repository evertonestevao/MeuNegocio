import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de Privacidade" };

const { legal } = brand;

const sections: LegalSection[] = [
  {
    title: "1. Quem é responsável por cada dado",
    body: `Controlador: ${legal.companyName}, CNPJ ${legal.cnpj}, ${legal.address}, para os dados da sua conta, da contratação e da segurança da plataforma.\nOperador: para os dados que cada empresa cadastra no ${brand.name}, como clientes, contatos, equipe, orçamentos, fotos e assinaturas, a empresa é a controladora e nós tratamos esses dados conforme as instruções dela.`,
  },
  {
    title: "2. Dados da conta e da empresa",
    body: "Cadastro: nome completo, email, foto de perfil opcional e senha (armazenada de forma protegida).\nEmpresa: nome, CNPJ, telefone, email, endereço e membros com seus papéis.\nRegistros: histórico das ações na empresa, e IP e navegador no aceite dos termos e nos consentimentos.\nPagamento: plano, situação da assinatura e identificadores do processador. Não armazenamos dados de cartão.",
  },
  {
    title: "3. Dados cadastrados pelas empresas",
    body: "Clientes: nome, documento, observações, contatos (nome, função, telefone e e-mail) e locais de atendimento com endereço.\nEquipe: nome, função e horas trabalhadas. O proprietário e o administrador também podem registrar telefone, tipo de contrato, valores por hora, nome legal, documento e chave PIX, que ficam restritos a esses dois papéis.\nOrçamentos e agenda: itens, valores, observações, visitas e seus horários.",
  },
  {
    title: "4. Fotos e assinaturas coletadas em campo",
    body: "Na ordem de serviço, o técnico pode anexar fotos com legenda e registrar relatório, horários, assinatura e nome de quem assinou. Fotos podem mostrar pessoas, imóveis e outros dados do local, então registre só o necessário para o serviço.\nOs arquivos ficam em armazenamento privado, separados por empresa, e são abertos por links temporários por quem tem permissão. Não coletamos localização nem usamos reconhecimento facial.",
  },
  {
    title: "5. Link de aprovação do orçamento",
    body: "Quando a empresa envia o link, quem o recebe vê o orçamento com os dados necessários para decidir, e pode registrar nome, decisão e comentário. Qualquer pessoa com o link consegue abrir o orçamento, então a empresa deve compartilhá-lo só com o destinatário. O IP é usado para limitar tentativas abusivas. Se a empresa usar o atalho de WhatsApp, a mensagem segue pelo WhatsApp, sujeita às regras dele.",
  },
  {
    title: "6. Finalidades e bases legais (LGPD, art. 7º)",
    body: "Execução de contrato: criar e manter sua conta, a empresa e os recursos contratados.\nCumprimento de obrigação legal: registros fiscais e de acesso (Marco Civil da Internet, art. 15).\nLegítimo interesse: segurança, prevenção a fraude e auditoria.\nConsentimento: comunicações por e-mail, revogável a qualquer momento.\nPara os dados cadastrados pelas empresas, cabe a cada empresa definir a base legal e informar os titulares.",
  },
  {
    title: "7. Compartilhamento e suboperadores",
    body: "Supabase: banco de dados, autenticação e arquivos.\nAsaas ou Stripe: pagamentos, conforme a contratação.\nResend: envio de emails.\nUpstash: controle de tentativas de acesso.\nSentry: monitoramento de erros, com remoção de dados sensíveis antes do envio.\nAlém desses, o provedor que hospeda a aplicação. Alguns serviços podem processar dados fora do Brasil, com as salvaguardas do art. 33 da LGPD.",
  },
  {
    title: "8. Quem acessa dentro da empresa",
    body: "Os dados de uma empresa não são visíveis para outras empresas. Dentro dela, o acesso depende do papel: o técnico, por exemplo, vê as próprias visitas e ordens de serviço. Dados de pagamento da equipe e custos ficam restritos ao proprietário e ao administrador.",
  },
  {
    title: "9. Cookies",
    body: "Usamos cookies essenciais para manter sua sessão autenticada e lembrar a empresa ativa e, se você chegar por um link de indicação, um cookie de até 30 dias que registra qual parceiro fez a indicação. Não usamos cookies de análise ou publicidade.\nAplicativo instalado: guarda no aparelho só arquivos do sistema, como ícones e código, e a preferência de não mostrar o convite de instalação. Telas, dados da empresa, fotos e assinaturas não ficam guardados nele.",
  },
  {
    title: "10. Retenção",
    body: "Mantemos os dados enquanto a conta e a empresa estiverem ativas e pelo prazo exigido por lei após o encerramento. Registros apagados nas telas e empresas encerradas saem de uso, mas podem continuar guardados. Fotos e assinaturas de ordens de serviço concluídas seguem esse mesmo tratamento. Hoje não há exclusão automática por prazo: para pedir a eliminação, use o canal da seção 11.",
  },
  {
    title: "11. Seus direitos (LGPD, art. 18)",
    body: `Confirmação, acesso, correção, portabilidade, eliminação, informação sobre compartilhamento e revogação do consentimento. Você pode baixar seus dados e excluir sua conta em Configurações, ou escrever para o encarregado: ${legal.dpoEmail}.\nSe você é cliente, contato ou integrante da equipe de uma empresa que usa o ${brand.name}, procure primeiro essa empresa, que é a controladora dos seus dados. Se precisar, encaminhamos o pedido a ela.`,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Política de Privacidade" updatedAt="02/11/2026" sections={sections} />;
}
