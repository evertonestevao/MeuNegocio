-- Nomes que aparecem na tela em português. Os códigos (owner, free, pro...) não mudam: as
-- regras e o gateway dependem deles. Planos continuam editáveis em /admin/planos.
update public.roles set name = 'Proprietário', description = 'Dono da empresa. Controle total, incluindo assinatura e exclusão da empresa.' where code = 'owner';
update public.roles set name = 'Administrador', description = 'Administra membros, convites e configurações, mas não decide sobre a assinatura.' where code = 'admin';
update public.roles set name = 'Membro', description = 'Acesso operacional à empresa, sem permissões administrativas.' where code = 'member';

update public.plans set name = 'Gratuito' where code = 'free' and name = 'Free';
update public.plans set name = 'Profissional' where code = 'pro' and name = 'Pro';
update public.plans set name = 'Empresarial' where code = 'enterprise' and name = 'Enterprise';
