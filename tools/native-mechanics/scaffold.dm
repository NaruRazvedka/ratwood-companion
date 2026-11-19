// Explicit isolated-handler scaffolding. This is not the Ratwood game runtime.
#define TRUE 1
#define FALSE 0
#define DF_USE_TAG 0
#define SKILL_LEVEL_APPRENTICE 2
#define LOG_GAME 0
#define FEATURED_STATS_ALCHEMISTS 0
#define STATS_POTIONS_BREWED 0
#define MT_INVISIBILITY "4"
/datum
	var/datum_flags
	var/abstract_type
/atom/proc/visible_message(a, b)
/proc/playsound(a, b, c, d, e)
/proc/span_notice(a)
	return a
/proc/span_warning(a)
	return a
/proc/span_info(a)
	return a
/proc/span_danger(a)
	return a
/proc/isitem(a)
	return istype(a, /obj/item)
/proc/to_chat(a, b)
/proc/record_featured_stat(a, b)
/proc/record_round_statistic(a)
/proc/english_list(a, b)
	return "isolated fixture"
/proc/qdel(datum/a)
	del(a)
/proc/get_turf(atom/a)
	while(a && !isturf(a))
		a = a.loc
	return a
/proc/cmp_numeric_dsc(a, b)
	return b-a
/proc/sortTim(list/items, cmp, associative)
	// shortcut: fixture sort covers unique winners only; use real TimSort for tie/order scenarios.
	for(var/i = 1, i <= items.len, i++)
		for(var/j = i+1, j <= items.len, j++)
			if(items[items[j]] > items[items[i]])
				items.Swap(i, j)
/mob/living
	var/STAINT = 10
	var/fixture_skill = 2
	var/fixture_armor_tier = 0
	var/list/mob_timers = list()
/mob/living/proc/getarmor(a, b, c, d, e, f, g, h)
	return fixture_armor_tier
/mob/living/proc/update_sneak_invis(reset)
/mob/living/proc/get_skill_level(a)
	return fixture_skill
/mob/living/proc/adjust_experience(a, b, c)
/mob/living/proc/log_message(a, b)
/mob/living/carbon/human
/obj/item
	var/smeltresult
	var/smelt_bar_num = 1
	var/fixture_quality
	var/fixture_sharp = FALSE
	var/sharpness = 0
	var/blade_int = 100
	var/max_blade_int = 100
/obj/item/New(loc, quality)
	..()
	fixture_quality = quality
/obj/item/proc/get_sharpness()
	return fixture_sharp
/obj/item/proc/attackby(obj/item/I, mob/living/user, params)
/obj/item/proc/update_cooktime(mob/living/user)
/obj/item/reagent_containers/food/snacks/rogue
	var/long_cooktime = 1
	var/short_cooktime = 1
/obj/item/alch
	var/major_pot
	var/med_pot
	var/minor_pot
/obj/machinery/light/rogue
	var/on = TRUE
	var/datum/fixture_reagents/reagents
/obj/machinery/light/rogue/proc/process()
/obj/machinery/light/rogue/proc/update_icon()
/obj/machinery/light/rogue/smelter
	var/list/contained_items = list()
	var/smelting_progress = 0
	var/smelting_ticks = 20
	var/actively_smelting = TRUE
/obj/machinery/light/rogue/cauldron
	var/list/ingredients = list()
	var/brewing = 0
	var/waterneed = 90
	var/mob/living/carbon/human/lastuser
/datum/fixture_reagents
	var/list/amounts = list()
/datum/fixture_reagents/proc/get_reagent_amount(path)
	return amounts[path] || 0
/datum/fixture_reagents/proc/has_reagent(path, amount)
	return get_reagent_amount(path) >= amount
/datum/fixture_reagents/proc/remove_reagent(path, amount)
	amounts[path] = max(0, get_reagent_amount(path)-amount)
/datum/fixture_reagents/proc/add_reagent(path, amount)
	amounts[path] = get_reagent_amount(path)+amount
/datum/fixture_reagents/proc/add_reagent_list(list/additions)
	for(var/path in additions)
		add_reagent(path, additions[path])
/datum/reagent/water
/datum/reagent/yuck
/obj/item/fixture_ingot
/obj/structure/table
var/global/fixture_action_completes = TRUE
/proc/do_after(a, b, target)
	return fixture_action_completes
/proc/add_sleep_experience(a, b, c)
