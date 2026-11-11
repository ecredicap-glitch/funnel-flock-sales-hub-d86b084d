import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MessageTemplate = Database["public"]["Tables"]["message_templates"]["Row"];
export type TemplateCategory = "first_contact" | "follow_up" | "proposal" | "reactivation";

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  first_contact: "Primeiro contato",
  follow_up: "Follow-up",
  proposal: "Proposta",
  reactivation: "Reativação",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as TemplateCategory[];

export const templatesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["templates", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("category")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

const SAIR = "\n\nSe preferir não receber mensagens, é só responder SAIR.";

/** Starter library for the financial sector: consultative tone, no promise of approval. */
export const STARTER_TEMPLATES: { name: string; category: TemplateCategory; body: string }[] = [
  {
    name: "Crédito — primeiro contato",
    category: "first_contact",
    body: `{Olá|Oi}, {{primeiro_nome}}! {Tudo bem?|Como vai?}\nAqui é da equipe de crédito. {Vi que você demonstrou interesse|Você pediu informações} sobre linhas de crédito. {Posso te explicar as opções disponíveis?|Quer que eu faça uma análise sem compromisso?}${SAIR}`,
  },
  {
    name: "Consórcio — primeiro contato",
    category: "first_contact",
    body: `{Olá|Oi}, {{primeiro_nome}}! {Tudo bem?|Espero que esteja bem.}\nO consórcio é uma forma planejada de conquistar {seu imóvel|seu veículo|seu objetivo} sem juros. {Posso te mostrar como funcionam as parcelas?|Quer conhecer as simulações?}${SAIR}`,
  },
  {
    name: "Limpa nome — primeiro contato",
    category: "first_contact",
    body: `{Olá|Oi}, {{primeiro_nome}}. {Tudo bem?|Como vai?}\nAjudamos a entender e negociar pendências no CPF, com orientação passo a passo. {Cada caso é analisado individualmente|O resultado depende da análise de cada caso}. {Posso te explicar como funciona?|Quer conversar sobre a sua situação?}${SAIR}`,
  },
  {
    name: "Rating — primeiro contato",
    category: "first_contact",
    body: `{Olá|Oi}, {{primeiro_nome}}! {Tudo bem?|Como vai?}\nTrabalhamos com {organização financeira|diagnóstico de rating} para empresas que querem {melhorar o relacionamento com bancos|se preparar para pedir crédito}. {Faz sentido conversarmos 10 minutos?|Posso te enviar mais detalhes?}${SAIR}`,
  },
  {
    name: "Follow-up gentil",
    category: "follow_up",
    body: `{Oi|Olá}, {{primeiro_nome}}! {Passando para saber|Só retomando} se você conseguiu ver minha mensagem anterior. {Fico à disposição para tirar dúvidas.|Se for um bom momento, posso te ligar rapidinho.}${SAIR}`,
  },
  {
    name: "Follow-up com documentos",
    category: "follow_up",
    body: `{Oi|Olá}, {{primeiro_nome}}. Para {seguir com a análise|avançarmos}, {preciso apenas|faltam apenas} {dos documentos combinados|de alguns documentos}. {Quer que eu envie a lista novamente?|Posso te ajudar com algum deles?}${SAIR}`,
  },
  {
    name: "Proposta enviada",
    category: "proposal",
    body: `{Olá|Oi}, {{primeiro_nome}}! {Preparei|Separei} uma proposta {de acordo com o|com base no} seu perfil. As condições finais dependem da análise da instituição. {Podemos revisar juntos?|Qual o melhor horário para conversarmos?}${SAIR}`,
  },
  {
    name: "Reativação",
    category: "reactivation",
    body: `{Oi|Olá}, {{primeiro_nome}}! {Faz um tempo que não conversamos|Lembrei de você}. {Surgiram novas opções|Temos novidades} que podem fazer sentido para o seu momento. {Quer que eu te conte?|Posso te enviar um resumo?}${SAIR}`,
  },
];
