/obj/machinery/light/rogue/smelter/proc/handle_smelting()
	for(var/obj/item/item as anything in contained_items)
		if(item.smeltresult)
			// disabled for now, balance reasons
			// while(item.smelt_bar_num)
			// 	item.smelt_bar_num--
			// 	var/obj/item/result = new item.smeltresult(src, contained_items[item])
			// 	contained_items += result
			// contained_items -= item
			var/obj/item/result = new item.smeltresult(src, contained_items[item])
			contained_items -= item
			contained_items += result
			qdel(item)
	playsound(src,'sound/misc/smelter_fin.ogg', 100, FALSE)
	visible_message(span_notice("\The [src] finished smelting."))
	smelting_progress = smelting_ticks + 1
	actively_smelting = FALSE


/obj/machinery/light/rogue/cauldron/process()
	..()
	update_icon()
	if(on)
		if(ingredients.len)
			if(brewing < 20)
				if(src.reagents.has_reagent(/datum/reagent/water,waterneed))
					brewing++
					if(prob(10))
						playsound(src, "bubbles", 100, FALSE)
			else if(brewing == 20)
				var/list/outcomes = list()
				for(var/obj/item/ing in src.ingredients)
					if(!istype(ing,/obj/item/alch))
						continue
					var/obj/item/alch/alching = ing
					if(alching.major_pot != null)
						if(outcomes[alching.major_pot] != null)
							outcomes[alching.major_pot] += 3
						else
							outcomes[alching.major_pot] = 3
					if(alching.med_pot != null)
						if(outcomes[alching.med_pot] != null)
							outcomes[alching.med_pot] += 2
						else
							outcomes[alching.med_pot] = 2
					if(alching.minor_pot != null)
						if(outcomes[alching.minor_pot] != null)
							outcomes[alching.minor_pot] += 1
						else
							outcomes[alching.minor_pot] = 1
				sortTim(outcomes,cmp=/proc/cmp_numeric_dsc,associative = 1)
				if(outcomes.len && (outcomes[outcomes[1]] >= 5))
					var/result_path = outcomes[1]
					var/datum/alch_cauldron_recipe/found_recipe = new result_path
					var/amt2raise = lastuser?.STAINT*2
					var/in_cauldron = src?.reagents?.get_reagent_amount(/datum/reagent/water)
					// Handle skillgating
					if(!lastuser)
						brewing = 0
						src.visible_message(span_info("The cauldron can't brew anything without an alchemist to guide it."))
						return
					if(found_recipe.skill_required > lastuser?.get_skill_level(/datum/skill/craft/alchemy))
						brewing = 0
						src.visible_message(span_warning("The ingredients in the cauldron melds together into a disgusting mess! Perhaps a more skilled alchemist is needed for this recipe."))
						if(reagents)
							src.reagents.remove_reagent(/datum/reagent/water, in_cauldron)
						for(var/obj/item/ing in src.ingredients)
							qdel(ing)
						src.reagents.add_reagent(/datum/reagent/yuck, in_cauldron) // 1 to 1 transmutation of yuck
						// Learn from your failure (Yeah you can technically still grind this way you just blow through a lot of ingredients)
						lastuser?.adjust_experience(/datum/skill/craft/alchemy, amt2raise, FALSE) 
						return
					for(var/obj/item/ing in src.ingredients)
						qdel(ing)
					if(reagents)
						src.reagents.remove_reagent(/datum/reagent/water, in_cauldron)
					if(found_recipe.output_reagents.len)
						src.reagents.add_reagent_list(found_recipe.output_reagents)
					if(found_recipe.output_items.len)
						for(var/itempath in found_recipe.output_items)
							new itempath(get_turf(src))
					//handle player perception and reset for next time
					src.visible_message("<span class='info'>The cauldron finishes boiling with a faint [found_recipe.smells_like] smell.</span>")
					lastuser.log_message("brewed [found_recipe.type] in [src] (REAGENTS: [english_list(found_recipe.output_reagents, "none")]) (ITEMS: [english_list(found_recipe.output_items, "none")])", LOG_GAME)
					record_featured_stat(FEATURED_STATS_ALCHEMISTS, lastuser)
					record_round_statistic(STATS_POTIONS_BREWED)
					//give xp for /datum/skill/craft/alchemy
					lastuser?.adjust_experience(/datum/skill/craft/alchemy, amt2raise, FALSE)
					playsound(src, "bubbles", 100, TRUE)
					playsound(src,'sound/misc/smelter_fin.ogg', 30, FALSE)
					ingredients = list()
					brewing = 21
					qdel(found_recipe)
				else
					brewing = 0
					src.visible_message("<span class='info'>The ingredients in the [src] fail to meld together at all...</span>")
					playsound(src,'sound/misc/smelter_fin.ogg', 30, FALSE)


#define ARMORID "armor-[blunt]-[slash]-[stab]-[piercing]-[fire]-[acid]-[magic]-[bullet]"

/proc/getArmor(blunt = 0, slash = 0, stab = 0, piercing = 0, fire = 0, acid = 0, magic = 0, bullet = 0)
	. = locate(ARMORID)
	if (!.)
		. = new /datum/armor(blunt, slash, stab, piercing, fire, acid, magic, bullet)

/datum/armor
	datum_flags = DF_USE_TAG
	/// better defined as area pressure melee
	var/blunt
	/// better defined as line pressure melee
	var/slash
	/// better defined as point pressure melee
	var/stab
	/// basically projectiles
	var/piercing
	/// protection against burning
	var/fire
	/// protection against pools of acid
	var/acid
	/// protection against magical attacks (make this adjustable via rune enchantments or something)
	var/magic
	/// protection against the cannon (this can be reused for guns when we redo them)
	var/bullet

/datum/armor/New(blunt = 0, slash = 0, stab = 0, piercing = 0, fire = 0, acid = 0, magic = 0, bullet = 0)
	src.blunt = blunt
	src.slash = slash
	src.stab = stab
	src.piercing = piercing
	src.fire = fire
	src.acid = acid
	src.magic = magic
	src.bullet = bullet
	
	tag = ARMORID

/datum/armor/proc/modifyRating(blunt = 0, slash = 0, stab = 0, piercing = 0, fire = 0, acid = 0, magic = 0, bullet = 0)
	return getArmor(src.blunt+blunt, src.slash+slash, src.stab+stab, src.piercing+piercing,src.fire+fire, src.acid+acid, src.magic+magic, src.bullet+bullet)

/datum/armor/proc/modifyAllRatings(modifier = 0)
	return getArmor(blunt+modifier, slash+modifier, stab+modifier, piercing+modifier,fire+modifier, acid+modifier, magic+modifier, bullet+modifier)

//TODO! PORT BLACKSTONE BLUNT/SLASH/STAB ARMOR DEFINES!!!!!!
/datum/armor/proc/multiplymodifyAllRatings(modifier = 0)
	return getArmor(blunt*modifier, slash*modifier, stab*modifier, piercing*modifier, fire*modifier, acid*modifier, magic*modifier, bullet*modifier)

/datum/armor/proc/setRating(blunt, slash, stab, piercing, fire, acid, magic, bullet)
	return getArmor((isnull(blunt) ? src.blunt : blunt),\
					(isnull(slash) ? src.slash : slash),\
					(isnull(stab) ? src.stab : stab),\
					(isnull(piercing) ? src.piercing : piercing),\
					(isnull(fire) ? src.fire : fire),\
					(isnull(acid) ? src.acid : acid),\
					(isnull(magic) ? src.magic : magic),\
					(isnull(bullet) ? src.bullet : bullet))

/datum/armor/proc/getRating(rating)
	return vars[rating]

/datum/armor/proc/getList()
	return list("blunt" = blunt, "slash" = slash, "stab" = stab, "piercing" = piercing, "fire" = fire, "acid" = acid, "magic" = magic, "bullet" = bullet)

/datum/armor/proc/attachArmor(datum/armor/AA)
	return getArmor(blunt+AA.blunt, slash+AA.slash, stab+AA.stab, piercing+AA.piercing, fire+AA.fire, acid+AA.acid, magic+AA.magic, bullet+AA.bullet)

/datum/armor/proc/detachArmor(datum/armor/AA)
	return getArmor(blunt-AA.blunt, slash-AA.slash, stab-AA.stab, piercing-AA.piercing, fire-AA.fire, acid-AA.acid, magic-AA.magic, bullet-AA.bullet)


#define PEN_NONE			0	// No penetration. Training weapons, base cuts/chops.
#define PEN_LIGHT			1	// Falx cut, axe chop. Penetrates trash armor (NPC cloth/bad leather).
#define PEN_MEDIUM			2	// Sword thrusts, longsword chop. Penetrates player light armor (gambeson, hardened leather).
#define PEN_HEAVY			3	// Spear, estoc. Penetrates mail/brigandine/plate at same-tier 20%.
#define PEN_BSTEEL			4	// Halfsword, dagger pick. Penetrates plate fully, blacksteel at 20%.

// Damage Blocking tiers (0-4). Armor clothing.
#define DBLOCK_NONE			0	// No blocking. Unarmored skin.
#define DBLOCK_LIGHT		1	// Cloth, bad leather, NPC trash armor.
#define DBLOCK_MEDIUM		2	// Gambeson, padded, hardened leather, studded — player light armor.
#define DBLOCK_HEAVY		3	// Brigandine, mail, cuirass, plate.
#define DBLOCK_BSTEEL		4	// Blacksteel, antagonist.

// Damage reduction tiers (0-5). Used by blunt (absorb), fire, acid (pierce).
// Note that blunt by default have 1.6x Integrity Multiplier.
// Damage multiplier = 1 / (1 + 0.2 * tier)
// Blunt: all damage absorbed by armor. Fire/Acid: reduced damage still hits HP.
#define DR_NONE				0	// Nothing. 100% damage. EDPS: 160%
#define DR_LIGHT			1	// Plate / Metal. 20% EHP increase. EDPS: 133%
#define DR_MEDIUM			2	// Mail. 40% EHP increase. EDPS: 114%
#define DR_HEAVY			3	// Bad Light Armor. 60% EHP increase. EDPS: 100%
#define DR_SUPER			4	// Medium Light Armor. 80% EHP increase. EDPS: 89%
#define DR_ULTRA			5	// Best quality light armor. 100% EHP increase. EDPS: 80%

// Armor damage type categories
// DR Absorb: damage reduced by tier, ALL damage goes to armor integrity (none to HP). Blunt.
// DR Pierce: damage reduced by tier, reduced damage STILL hits HP. Armor also takes integrity damage. Fire, acid, bullet
// DBLOCK: tier pass/fail penetration system. Slash, stab, piercing.
#define BLUNT_DR_COEFFICIENT 0.3 // Blunt only: 1 / (1 + 0.3 * tier) = 60% reduction at tier 5
#define ARMOR_DR_ABSORB_TYPES list("blunt")
#define ARMOR_DR_PIERCE_TYPES list("fire", "acid", "bullet")
#define ARMOR_DR_TYPES list("blunt", "fire", "acid", "bullet")
#define ARMOR_DBLOCK_TYPES list("slash", "stab", "piercing")

// Penetration passthrough fractions
#define PEN_PASSTHROUGH_MINIMUM 0.4
#define PEN_PASSTHROUGH_RATIO	0.1		// How much damage will go through per pen point (+ per relevant stat above 10). 0.1 = 10%
#define PEN_PASSTHROUGH_PROJ_EQUAL 0.2
#define PEN_PASSTHROUGH_PROJ_MORE 0.8
#define PEN_PASSTHROUGH_CAP	8			// How many "dots" maximum (pen vs armor, + 1 dot per relevant stat above 10)
// pen < armor tier: fully blocked (0 through)
// 0.2 is calculated from 55 AP + 30 damage spear = 5 damage through on 80 plate (stab), 5 / 30 = 0.166, rounded up to 0.2. This somewhat matches old system behavior.

/*------------------------\
| ARMOR INTEGRITY DEFINES | // Use these when possible on armor to keep value consistent.
\------------------------*/
// Side = Non-chest armor integrity
// For now. Steel vs Iron will be a difference of 75% integrity without rating differences.
// So Iron will actually be pretty decent and there shouldn't be a compulsive need to upgrade.

#define ARMOR_INTEG_FAILURE 0.1	//Percentage of damage the armor breaks at. 0.1 = 10%

// Helmet
#define ARMOR_INT_HELMET_ANTAG 600
#define ARMOR_INT_HELMET_BLACKSTEEL 500
#define ARMOR_INT_HELMET_HEAVY_BRONZE 450
#define ARMOR_INT_HELMET_HEAVY_STEEL 400
#define ARMOR_INT_HELMET_HEAVY_IRON 300
#define ARMOR_INT_HELMET_HEAVY_DECREPIT 200
#define ARMOR_INT_HELMET_HEAVY_ADJUSTABLE_PENALTY 50 // Integrity reduction, if a helmet is adjustable
#define ARMOR_INT_HELMET_BRONZE 350 //More integrity, less protection.
#define ARMOR_INT_HELMET_STEEL 300
#define ARMOR_INT_HELMET_IRON 225
#define ARMOR_INT_HELMET_DECREPIT 100
#define ARMOR_INT_HELMET_HARDLEATHER 250
#define ARMOR_INT_HELMET_LEATHER 200
#define ARMOR_INT_HELMET_CLOTH 100


#define SHARPNESS_TIER2_THRESHOLD	0.2 //%-age threshold when damage *really* falls off. Base damage value included.


/mob/living/proc/run_armor_check(def_zone = null, attack_flag = "blunt", absorb_text = null, soften_text = null, armor_penetration = PEN_NONE, penetrated_text, damage, blade_dulling, intdamfactor, used_weapon = null, pen_info, no_debuff = FALSE)
	var/armor_tier = getarmor(def_zone, attack_flag, damage, armor_penetration, blade_dulling, intdamfactor, used_weapon, pen_info)

	// Tier-based armor system.
	// armor_tier and armor_penetration are both tier values (0-4).
	// DR Absorb (blunt): damage * 1 / (1 + 0.2 * tier). All damage absorbed by armor, none to HP.
	// DR Pierce (fire, acid): same DR formula, but reduced damage still hits HP. Armor also takes integrity damage.
	// DBLOCK types (ARMOR_DBLOCK_TYPES):
	//   pen > armor  = 100% through (full penetration)
	//   pen == armor = 20% through (partial penetration)
	//   pen < armor  = fully blocked
	// Safety: if damage wasn't passed, blocked math would return 0 (null * anything = 0 in DM),
	// silently making armor do nothing. Use a safe fallback for the blocked calculation only —
	// don't feed it into checkarmor (which already ran above and handles null damage fine).
	var/block_damage = damage || 999
	var/blocked = 0
	if(attack_flag in ARMOR_DR_ABSORB_TYPES)
		// Blunt: armor absorbs all HP damage. DR reduces integrity damage to armor (in checkarmor).
		if(armor_tier > 0)
			blocked = block_damage
	else if(attack_flag in ARMOR_DR_PIERCE_TYPES)
		// Fire/Acid: DR reduces damage, but reduced damage still reaches HP.
		if(armor_tier > 0)
			var/dr_mult = 1 / (1 + 0.2 * armor_tier)
			blocked = block_damage * (1 - dr_mult)
	else
		// Penetration: tier comparison
		if(attack_flag != "piercing")
			if(armor_tier > 0)
				if(armor_penetration >= armor_tier)
					if(used_weapon)
						var/obj/item/I = used_weapon
						if(I.sharpness)
							if((I.blade_int / I.max_blade_int) <= SHARPNESS_TIER2_THRESHOLD) // Our sharpness is 'chunked' (<20%), so we do not pen at all.
								armor_penetration = 0
					if(armor_penetration)
						blocked = block_damage * (1 - (PEN_PASSTHROUGH_MINIMUM + (armor_penetration * PEN_PASSTHROUGH_RATIO)))
					if(penetrated_text)
						to_chat(src, span_danger("[penetrated_text]"))
				else
					// Fully blocked
					blocked = block_damage * 10
					if(absorb_text)
						to_chat(src, span_notice("[absorb_text]"))
		else	// Unfortunate special behaviour for projectiles because they are absent most data pen_info wants (attacker mob ref, weapon sharpness, intent, etc)
			if(armor_tier > 0)
				if(armor_penetration == armor_tier)
					blocked = block_damage * (1 - PEN_PASSTHROUGH_PROJ_EQUAL) // We block 80% of the damage, letting 20% through to body / into integ.
					if(penetrated_text)
						to_chat(src, span_danger("[penetrated_text]"))
				else if(armor_penetration > armor_tier)
					blocked = block_damage * (1 - PEN_PASSTHROUGH_PROJ_EQUAL) // We block 80% of the damage, letting 20% through to body / into integ.
					if(penetrated_text)
						to_chat(src, span_danger("[penetrated_text]"))
				else
					// Fully blocked
					blocked = block_damage * 10
					if(absorb_text)
						to_chat(src, span_notice("[absorb_text]"))

	if(used_weapon)
		if(isitem(used_weapon))
			var/obj/item/I = used_weapon
			if(I.sharpness && I.max_blade_int && !(attack_flag in ARMOR_DR_ABSORB_TYPES))
				var/dullness_ratio = I.blade_int / I.max_blade_int
				if(dullness_ratio <= SHARPNESS_TIER2_THRESHOLD)	//Our weapon is CHUNKED. What are we PENNING WITH.
					blocked = block_damage * 10

	if(mob_timers[MT_INVISIBILITY] > world.time)			
		mob_timers[MT_INVISIBILITY] = world.time
		update_sneak_invis(reset = TRUE)
	return blocked


/obj/item/reagent_containers/food/snacks/rogue/dough/attackby(obj/item/I, mob/living/user, params)
	var/found_table = locate(/obj/structure/table) in (loc)
	update_cooktime(user)
	if(istype(I, /obj/item/reagent_containers/food/snacks/butterslice))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'modular/Neu_Food/sound/kneading_alt.ogg', 90, TRUE, -1)
			to_chat(user, span_notice("Kneading butter into the dough..."))
			if(do_after(user,long_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/butterdough(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to roll it out!"))
	if(istype(I, /obj/item/reagent_containers/food/snacks/rogue/raisins))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'modular/Neu_Food/sound/kneading.ogg', 100, TRUE, -1)
			to_chat(user, span_notice("Kneading the dough and adding raisins..."))
			if(do_after(user,short_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/rbread_half(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
	if(istype(I, /obj/item/reagent_containers/food/snacks/rogue/fruit/apple_sliced))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'modular/Neu_Food/sound/kneading.ogg', 100, TRUE, -1)
			to_chat(user, span_notice("Kneading the dough and adding apple slices..."))
			if(do_after(user,short_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/abread_half(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
	if(istype(I, /obj/item/reagent_containers/food/snacks/rogue/butterdough))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'modular/Neu_Food/sound/kneading.ogg', 100, TRUE, -1)
			to_chat(user, span_notice("Kneading the dough into an elongated shape..."))
			if(do_after(user,short_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/strudeldough(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to roll it out!"))
	if(istype(I, /obj/item/kitchen/rollingpin))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'modular/Neu_Food/sound/rollingpin.ogg', 100, TRUE, -1)
			to_chat(user, span_notice("Rolling the dough flat and thin..."))
			if(do_after(user,long_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/flatdough(get_turf(src))
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to roll it out!"))
	else
		return ..()


/obj/item/reagent_containers/food/snacks/rogue/flatdough/attackby(obj/item/I, mob/living/user, params)
	var/found_table = locate(/obj/structure/table) in (loc)
	update_cooktime(user)
	if(I.get_sharpness())
		if(isturf(loc)&& (found_table))
			playsound(user, 'modular/Neu_Food/sound/rollingpin.ogg', 100, TRUE, -1)
			to_chat(user, span_notice("Scoring lines into [src]..."))
			if(do_after(user,long_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/foodbase/hardtack_raw(get_turf(src))
				new /obj/item/reagent_containers/food/snacks/rogue/foodbase/hardtack_raw(get_turf(src))
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to score it into crackerdough!"))
	if(istype(I, /obj/item/reagent_containers/food/snacks/grown/fruit/tomato))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'sound/foley/dropsound/food_drop.ogg', 40, TRUE, -1)
			to_chat(user, span_notice("Meticulously crushing the tomatoes into a thick, chunky sauce..."))
			if(do_after(user,long_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/foodbase/tomatoplate_raw(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to smear the flatdough with sauced tomatoes!"))
	if(istype(I, /obj/item/reagent_containers/food/snacks/grown/fruit/tomato_sliced))
		if(isturf(loc)&& (found_table))
			playsound(get_turf(user), 'sound/foley/dropsound/food_drop.ogg', 40, TRUE, -1)
			to_chat(user, span_notice("Crushing the sliced tomatoes into a thick, velvety sauce..."))
			if(do_after(user,short_cooktime, target = src))
				add_sleep_experience(user, /datum/skill/craft/cooking, user.STAINT)
				new /obj/item/reagent_containers/food/snacks/rogue/foodbase/tomatoplate_raw(get_turf(src))
				qdel(I)
				qdel(src)
				return TRUE
		else
			to_chat(user, span_warning("You need to put [src] on a table to smear the flatdough with sauced tomatoes!"))
	else
		return ..()


/datum/alch_cauldron_recipe
	abstract_type = /datum/alch_cauldron_recipe // This is an abstract type, it should not be instantiated directly.
	var/name = "" //The name of the recipe, kinda there just in case.
	var/category = "Potions"
	var/smells_like = "nothing" //cauldron emits this smell when done, and alchemists can sniff ingredients to find what they do
	var/skill_required = SKILL_LEVEL_APPRENTICE // Minimum skill to create this recipe successfully (It just won't mix otherwise) - Minimum Apprentice 
	var/list/output_reagents = list() //list of paths of new reagents to create in the cauldron. Remember, 1 oz is 3 units! [reagent = amnt]
	var/list/output_items = list() //List of paths for new items that should be created, [path = chance to be created]


/datum/alch_cauldron_recipe/antidote
	name = "Antidote"
	smells_like = "wet moss"
	output_reagents = list(/datum/reagent/medicine/antidote = 100)

